import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { noteKey, parseBulkDocument, type BulkParseResult } from "../lib/bulkNotes";
import { formatSydneyTime, sydneyTodayIso } from "../lib/dates";
import { focusSuggestions, mondayOf, type FocusRow } from "../lib/focus";
import { tallyView } from "../lib/tally";
import { pickTermForDate, type TermRow } from "../lib/terms";
import { matchTouchPoints, type TouchPointNote } from "../lib/touchPoints";
import { supabase } from "../lib/supabase";
import { matchNote, type NoteMatch } from "../lib/touchPoints";
import { BulkUploadPanel } from "./BulkUploadPanel";
import { FocusSuggestions } from "./FocusSuggestions";
import { MatchStudentPanel, type PickerStudent } from "./MatchStudentPanel";
import { ScreenActions, ScreenSubtitle } from "./ScreenBar";
import { TouchTallyStrip } from "./TouchTallyStrip";
import { TickIcon, UploadIcon, WarningIcon } from "./Icons";

type TodayNote = {
  id: string;
  student_id: string | null;
  student_name: string;
  note_text: string;
  created_at: string;
  added_by: string | null;
};

const NOTE_COLUMNS = "id, student_id, student_name, note_text, created_at, added_by";

// The term's notes, which the tally strip counts. The id is what lets a
// removal be taken out of them without reading the whole term again.
const TERM_NOTE_COLUMNS =
  "id, student_id, student_name, note_date, note_text, added_by, draft_created";

type TermNote = TouchPointNote & { id: string };

// With no term to scope to, the same rolling window the Parents screen
// falls back to, so the two agree about what "this term" means.
const TOUCH_POINT_FALLBACK_DAYS = 90;

function fallbackWindowStart(): string {
  const start = new Date();
  start.setDate(start.getDate() - TOUCH_POINT_FALLBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

// Small counts read better as words. Anything larger is rare enough that a
// digit is clearer than spelling it out.
const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function TodayScreen() {
  const [studentName, setStudentName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<TodayNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputMessage, setInputMessage] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [students, setStudents] = useState<PickerStudent[] | null>(null);
  // The suggestion strip's own data. Null until it has all arrived, so the
  // strip shows nothing at all while it is still loading.
  const [focusRows, setFocusRows] = useState<FocusRow[] | null>(null);
  const [termNotes, setTermNotes] = useState<TermNote[] | null>(null);
  // Set when the read behind the tally strip fails. The strip then shows
  // nothing at all rather than a number that is not true.
  const [tallyFailed, setTallyFailed] = useState(false);
  // Kept so the term's notes can be read again after a bulk upload without
  // working the window out a second time.
  const [termWindowStart, setTermWindowStart] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // The document being previewed, held only while the panel is open. Nothing
  // about it is written until the panel's own button is pressed.
  const [bulk, setBulk] = useState<{
    fileName: string;
    result: BulkParseResult | null;
    readFailed: boolean;
  } | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const liveRef = useRef(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const staffRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // Read once on open, and again after a bulk upload has saved. Nothing else
  // reloads it: a note added or removed here is applied to the list in place.
  const loadNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("daily_notes")
      .select(NOTE_COLUMNS)
      .eq("note_date", sydneyTodayIso())
      .order("created_at", { ascending: false });
    if (!liveRef.current) return;
    if (error) {
      setLoadFailed(true);
      setNotes([]);
      return;
    }
    setLoadFailed(false);
    setNotes((data ?? []) as TodayNote[]);
  }, []);

  useEffect(() => {
    liveRef.current = true;
    void loadNotes();
    return () => {
      liveRef.current = false;
    };
  }, [loadNotes]);

  // The active roster, used only to work out which student each note is
  // about. Nothing here is written unless a person taps a candidate.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("students")
      .select("id, student_name, parent_name")
      .eq("enrolment_status", "Active")
      .then(({ data, error }) => {
        if (cancelled) return;
        // The roster is half of what the tally strip counts, so losing it
        // hides the strip. The rest of the screen carries on without it.
        if (error) setTallyFailed(true);
        setStudents((data ?? []) as PickerStudent[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The term's notes. They feed the suggestion strip, which simply shows
  // nothing when they are missing, and the tally strip, which hides itself.
  const loadTermNotes = useCallback(async (windowStart: string) => {
    const { data, error } = await supabase
      .from("daily_notes")
      .select(TERM_NOTE_COLUMNS)
      .gte("note_date", windowStart);
    if (!liveRef.current) return;
    if (error) {
      setTallyFailed(true);
      setTermNotes([]);
      return;
    }
    setTermNotes((data ?? []) as TermNote[]);
  }, []);

  // This week's focus, and the term's touch points, for the suggestion
  // strip. Read only, and never fatal: a failure here simply means no
  // strip, which is the same as having nobody to suggest.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = sydneyTodayIso();
      const [focusRes, termRes] = await Promise.all([
        supabase.from("weekly_focus").select("parent_name, week_start"),
        supabase
          .from("term_settings")
          .select("term_name, term_start_date, term_end_date, p2_deadline")
          .order("term_start_date", { ascending: true }),
      ]);
      if (cancelled) return;
      setFocusRows((focusRes.data ?? []) as FocusRow[]);

      // The same term window the Parents screen scopes touch points to. No
      // term rows is a fallback rather than a failure, so it does not hide
      // the tally strip.
      const term = pickTermForDate((termRes.data ?? []) as TermRow[], today);
      const windowStart = term?.term_start_date ?? fallbackWindowStart();
      if (cancelled) return;
      setTermWindowStart(windowStart);
      await loadTermNotes(windowStart);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTermNotes]);

  // The note box starts about four lines tall and grows with the text.
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [noteText]);

  async function handleAdd() {
    if (saving) return;
    const name = studentName.trim();
    const staff = staffName.trim();
    const note = noteText.trim();
    if (!name || !staff || !note) {
      setInputMessage("Add a student name, a staff member, and a note.");
      return;
    }
    setSaving(true);
    setInputMessage(null);
    const row = {
      student_name: name,
      note_text: note,
      note_date: sydneyTodayIso(),
      collated: false,
      draft_created: false,
      no_match: false,
      added_by: staff,
    };
    const { data, error } = await supabase
      .from("daily_notes")
      .insert(row)
      .select(NOTE_COLUMNS)
      .single();
    if (error || !data) {
      setInputMessage("The note could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    const saved = data as TodayNote;
    setNotes((current) => [saved, ...(current ?? [])]);
    // Straight into the term's notes as well, built from the row that was
    // just written rather than guessed at, so the tally strip is working
    // from the same set. None of its numbers move: a note with no draft
    // yet has not reached a parent, and that is the point.
    setTermNotes((current) =>
      current === null
        ? current
        : [
            ...current,
            {
              id: saved.id,
              student_id: null,
              student_name: row.student_name,
              note_date: row.note_date,
              note_text: row.note_text,
              tidied_text: null,
              added_by: row.added_by,
              draft_created: row.draft_created,
            },
          ],
    );
    // The staff member field keeps its value because the same person usually
    // adds several notes in a row.
    setStudentName("");
    setNoteText("");
    setSaving(false);
    nameRef.current?.focus();
  }

  // Enter steps from student name to staff member to note, then saves from
  // the note field. Shift Enter makes a new line in the note, and Control or
  // Command with Enter saves from any field. Nothing fires mid save.
  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (saving) return;
    if (event.ctrlKey || event.metaKey) {
      void handleAdd();
      return;
    }
    staffRef.current?.focus();
  }

  function handleStaffKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (saving) return;
    if (event.ctrlKey || event.metaKey) {
      void handleAdd();
      return;
    }
    noteRef.current?.focus();
  }

  function handleNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (!saving) void handleAdd();
      return;
    }
    if (event.shiftKey) return;
    event.preventDefault();
    if (!saving) void handleAdd();
  }

  async function handleRemove(note: TodayNote) {
    if (removingId) return;
    const sure = window.confirm(`Remove the note for ${note.student_name}?`);
    if (!sure) return;
    setRemovingId(note.id);
    setListMessage(null);
    const { error } = await supabase.from("daily_notes").delete().eq("id", note.id);
    if (error) {
      setListMessage("The note could not be removed. Please try again.");
      setRemovingId(null);
      return;
    }
    setNotes((current) => (current ?? []).filter((item) => item.id !== note.id));
    // Out of the term's notes too. This one can move the numbers: a note
    // written earlier today and drafted this evening still sits on the list
    // until midnight.
    setTermNotes((current) =>
      current === null ? current : current.filter((item) => item.id !== note.id),
    );
    setRemovingId(null);
  }

  // Only a .docx is offered, and only a .docx is accepted. The picker's own
  // filter can be talked round on some systems, so the name is checked again
  // here rather than trusted.
  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setUploadMessage("That is not a Word document. Choose a file ending in .docx.");
      return;
    }
    setUploadMessage(null);
    // Focus lands back here when the panel closes, so it has to be here when
    // the panel opens rather than on the hidden picker.
    uploadRef.current?.focus();
    setBulk({ fileName: file.name, result: null, readFailed: false });
    try {
      const buffer = await file.arrayBuffer();
      // Loaded only when a document is actually chosen, and read here in the
      // browser. The file is never sent anywhere.
      //
      // The HTML rather than the plain text, because the plain text drops the
      // soft line breaks inside a table cell and a whole student runs
      // together into one line. Empty paragraphs have to be kept as well:
      // mammoth throws them away by default, and in a paragraph document they
      // are what separates one student from the next.
      const mammoth = await import("mammoth/mammoth.browser.js");
      const read = await mammoth.default.convertToHtml(
        { arrayBuffer: buffer },
        { ignoreEmptyParagraphs: false },
      );
      if (!liveRef.current) return;
      setBulk({ fileName: file.name, result: parseBulkDocument(read.value), readFailed: false });
    } catch {
      if (!liveRef.current) return;
      setBulk({ fileName: file.name, result: null, readFailed: true });
    }
  }

  // Worked out at display time with the same shared module the Parents
  // screen uses, so the two screens can never disagree about a note.
  const matches = useMemo(() => {
    const found = new Map<string, NoteMatch<PickerStudent>>();
    if (!notes || !students) return found;
    for (const note of notes) found.set(note.id, matchNote(note, students));
    return found;
  }, [notes, students]);

  // In this week's focus and not yet written about this term. Empty while
  // anything is still loading, so the strip never flashes a stale list.
  const suggestions = useMemo(() => {
    if (!students || !focusRows || !termNotes) return [];
    const touched = matchTouchPoints(termNotes, students);
    return focusSuggestions(
      students,
      focusRows,
      new Set(touched.keys()),
      mondayOf(sydneyTodayIso()),
    );
  }, [students, focusRows, termNotes]);

  // Everything the tally strip needs, worked out in one place so the numbers
  // and the bar can never be derived from different sets.
  const tally = useMemo(
    () =>
      tallyView({
        failed: tallyFailed,
        notes: termNotes,
        students,
        today: sydneyTodayIso(),
      }),
    [tallyFailed, termNotes, students],
  );

  // One array, so the panel below is not handed a new roster on every render
  // and made to work out every match again.
  const roster = useMemo(() => students ?? [], [students]);

  // Today's notes as name and text squashed together, which is what makes a
  // note from a document the same note as one already on the list.
  const existingKeys = useMemo(
    () => new Set((notes ?? []).map((note) => noteKey(note.student_name, note.note_text))),
    [notes],
  );

  const picking = pickingId ? (notes ?? []).find((note) => note.id === pickingId) : undefined;
  const pickingMatch = pickingId ? matches.get(pickingId) : undefined;

  function handleMatched(student: PickerStudent) {
    setNotes((current) =>
      (current ?? []).map((note) =>
        note.id === pickingId
          ? { ...note, student_id: String(student.id), student_name: student.student_name }
          : note,
      ),
    );
    setPickingId(null);
  }

  const loading = notes === null;
  const count = notes?.length ?? 0;
  const countLabel = `${count} ${count === 1 ? "note" : "notes"}`;

  return (
    <section className="today-screen">
      <TouchTallyStrip view={tally} />

      <ScreenSubtitle>
        {countLabel === "0 notes" ? "No notes yet" : `${countLabel} added`}
      </ScreenSubtitle>
      <ScreenActions>
        <button
          type="button"
          className="primary-button screen-bar-button"
          disabled={saving}
          onClick={handleAdd}
        >
          {saving ? "Adding..." : "Add note"}
        </button>
      </ScreenActions>

      <div className="today-input-card">
        <label className="field-label" htmlFor="today-student">
          Student name
        </label>
        <input
          id="today-student"
          className="text-field"
          type="text"
          ref={nameRef}
          value={studentName}
          onChange={(event) => {
            setStudentName(event.target.value);
            setInputMessage(null);
          }}
          onKeyDown={handleNameKeyDown}
        />
        <label className="field-label" htmlFor="today-staff">
          Staff member
        </label>
        <input
          id="today-staff"
          className="text-field"
          type="text"
          ref={staffRef}
          value={staffName}
          onChange={(event) => {
            setStaffName(event.target.value);
            setInputMessage(null);
          }}
          onKeyDown={handleStaffKeyDown}
        />
        <label className="field-label" htmlFor="today-note">
          Note
        </label>
        <textarea
          id="today-note"
          className="text-field today-note-entry"
          rows={4}
          ref={noteRef}
          value={noteText}
          onChange={(event) => {
            setNoteText(event.target.value);
            setInputMessage(null);
          }}
          onKeyDown={handleNoteKeyDown}
        />
        {inputMessage ? (
          <p className="today-form-message" role="alert">
            {inputMessage}
          </p>
        ) : null}
        <button
          type="button"
          className="primary-button today-add"
          disabled={saving}
          onClick={handleAdd}
        >
          {saving ? "Adding..." : "Add note"}
        </button>
        <p className="today-hint">
          <kbd className="key-chip">Enter</kbd> for the next field,{" "}
          <kbd className="key-chip">Enter</kbd> in the note to save,{" "}
          <kbd className="key-chip">Shift</kbd> <kbd className="key-chip">Enter</kbd> for a new line
        </p>

        <p className="today-or">
          <span>or</span>
        </p>
        <input
          className="today-file"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ref={fileRef}
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared straight away so choosing the same file twice in a row
            // still counts as a change.
            event.target.value = "";
            void handleFile(file);
          }}
        />
        <button
          type="button"
          className="today-upload"
          ref={uploadRef}
          onClick={() => fileRef.current?.click()}
        >
          <UploadIcon className="today-upload-icon" size={16} />
          Upload a document
        </button>
        {uploadMessage ? (
          <p className="today-form-message today-upload-message" role="alert">
            {uploadMessage}
          </p>
        ) : null}
      </div>

      <FocusSuggestions students={suggestions} />

      <div className="today-list-section">
        <div className="today-list-head">
          <h2 className="section-heading">Added today</h2>
        </div>
        {listMessage ? (
          <p className="today-message" role="alert">
            {listMessage}
          </p>
        ) : null}
        {loading ? (
          <p className="today-message">Loading today's notes</p>
        ) : loadFailed ? (
          <p className="today-message" role="alert">
            Today's notes could not be loaded. Please try again.
          </p>
        ) : count === 0 ? (
          <p className="today-message">No notes yet today. Add your first one above.</p>
        ) : (
          <ul className="today-list">
            {notes.map((note) => {
              const match = matches.get(note.id);
              const unresolved = Boolean(match) && match!.kind !== "matched";
              return (
                <li
                  key={note.id}
                  className={`today-item${unresolved ? " today-item-unmatched" : ""}`}
                >
                  <div className="today-item-top">
                    <span className="today-item-name">{note.student_name}</span>
                    <span className="today-item-when">
                      {note.added_by ? (
                        <span className="today-item-by today-item-by-inline">
                          Added by {note.added_by}
                        </span>
                      ) : null}
                      <span className="today-item-time">{formatSydneyTime(note.created_at)}</span>
                    </span>
                  </div>
                  <p className="today-item-text">{note.note_text}</p>
                  {note.added_by ? (
                    <p className="today-item-by today-item-by-block">Added by {note.added_by}</p>
                  ) : null}
                  <div className="today-item-foot">
                    {match ? (
                      match.kind === "matched" ? (
                        <span className="today-match today-match-good">
                          <TickIcon className="today-match-icon" size={13} />
                          Matched to {match.student.student_name}
                        </span>
                      ) : (
                        <span className="today-match today-match-warn">
                          <WarningIcon className="today-match-icon" size={15} />
                          {match.kind === "ambiguous"
                            ? `${countWord(match.candidates.length)} students could match`
                            : "No student found"}
                        </span>
                      )
                    ) : (
                      <span className="today-match" />
                    )}
                    <span className="today-item-actions">
                      {unresolved ? (
                        <button
                          type="button"
                          className="today-match-button"
                          onClick={() => setPickingId(note.id)}
                        >
                          Match to a student
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="remove-button"
                        disabled={removingId === note.id}
                        onClick={() => handleRemove(note)}
                      >
                        {removingId === note.id ? "Removing..." : "Remove"}
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="today-strip">
        <strong>7:30 pm tonight:</strong> these notes collate automatically and land on the Output
        screen.
      </p>

      {bulk ? (
        <BulkUploadPanel
          fileName={bulk.fileName}
          result={bulk.result}
          readFailed={bulk.readFailed}
          students={roster}
          existingKeys={existingKeys}
          onClose={() => setBulk(null)}
          onSaved={() => {
            void loadNotes();
            // The new notes have no drafts, so nothing on the strip moves.
            // Reading them in anyway keeps it working from the whole term
            // rather than from a set that is quietly out of date.
            if (termWindowStart) void loadTermNotes(termWindowStart);
          }}
        />
      ) : null}

      {picking && pickingMatch && pickingMatch.kind !== "matched" ? (
        <MatchStudentPanel
          noteId={picking.id}
          typedName={picking.student_name}
          candidates={pickingMatch.kind === "ambiguous" ? pickingMatch.candidates : []}
          students={students ?? []}
          onMatched={handleMatched}
          onClose={() => setPickingId(null)}
        />
      ) : null}
    </section>
  );
}
