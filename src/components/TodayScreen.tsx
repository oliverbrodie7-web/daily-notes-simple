import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatSydneyTime, sydneyTodayIso } from "../lib/dates";
import { supabase } from "../lib/supabase";

type TodayNote = {
  id: string;
  student_name: string;
  note_text: string;
  created_at: string;
  added_by: string | null;
};

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
  const nameRef = useRef<HTMLInputElement | null>(null);
  const staffRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes")
      .select("id, student_name, note_text, created_at, added_by")
      .eq("note_date", sydneyTodayIso())
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadFailed(true);
          setNotes([]);
          return;
        }
        setNotes((data ?? []) as TodayNote[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const { data, error } = await supabase
      .from("daily_notes")
      .insert({
        student_name: name,
        note_text: note,
        note_date: sydneyTodayIso(),
        collated: false,
        draft_created: false,
        no_match: false,
        added_by: staff,
      })
      .select("id, student_name, note_text, created_at, added_by")
      .single();
    if (error || !data) {
      setInputMessage("The note could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    setNotes((current) => [data as TodayNote, ...(current ?? [])]);
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
    setRemovingId(null);
  }

  const loading = notes === null;
  const count = notes?.length ?? 0;
  const countLabel = `${count} ${count === 1 ? "note" : "notes"}`;

  return (
    <section className="today-screen">
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
      </div>

      <div className="today-list-section">
        <div className="today-list-head">
          <h2 className="section-heading">Added today</h2>
          <span className="today-count">{countLabel}</span>
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
            {notes.map((note) => (
              <li key={note.id} className="today-item">
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
                  <button
                    type="button"
                    className="remove-button"
                    disabled={removingId === note.id}
                    onClick={() => handleRemove(note)}
                  >
                    {removingId === note.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="today-strip">
        <strong>7:30 pm tonight:</strong> these notes collate automatically and land on the Output
        screen.
      </p>
    </section>
  );
}
