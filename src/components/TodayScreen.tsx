import { useEffect, useRef, useState } from "react";
import { formatSydneyTime, sydneyTodayIso } from "../lib/dates";
import { supabase } from "../lib/supabase";

type TodayNote = {
  id: string;
  student_name: string;
  note_text: string;
  created_at: string;
};

// Split on the first hyphen only: the name before it, the note after it.
// Any further hyphens belong to the note itself.
function parseEntry(raw: string): { studentName: string; noteText: string } | null {
  const hyphenAt = raw.indexOf("-");
  if (hyphenAt === -1) return null;
  const studentName = raw.slice(0, hyphenAt).trim();
  const noteText = raw.slice(hyphenAt + 1).trim();
  if (!studentName || !noteText) return null;
  return { studentName, noteText };
}

export function TodayScreen() {
  const [entry, setEntry] = useState("");
  const [notes, setNotes] = useState<TodayNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputMessage, setInputMessage] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes")
      .select("id, student_name, note_text, created_at")
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

  async function handleAdd() {
    if (saving) return;
    const parsed = parseEntry(entry);
    if (!parsed) {
      setInputMessage("Add a student name, then a dash, then the note.");
      return;
    }
    setSaving(true);
    setInputMessage(null);
    const { data, error } = await supabase
      .from("daily_notes")
      .insert({
        student_name: parsed.studentName,
        note_text: parsed.noteText,
        note_date: sydneyTodayIso(),
        collated: false,
        draft_created: false,
        no_match: false,
      })
      .select("id, student_name, note_text, created_at")
      .single();
    if (error || !data) {
      setInputMessage("The note could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    setNotes((current) => [data as TodayNote, ...(current ?? [])]);
    setEntry("");
    setSaving(false);
    boxRef.current?.focus();
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
        <label className="field-label" htmlFor="today-entry">
          Add a note
        </label>
        <textarea
          id="today-entry"
          className="text-field today-entry"
          rows={3}
          ref={boxRef}
          value={entry}
          onChange={(event) => {
            setEntry(event.target.value);
            setInputMessage(null);
          }}
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
        <p className="today-helper">Student name first, then a dash, then the note.</p>
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
                  <span className="today-item-time">{formatSydneyTime(note.created_at)}</span>
                </div>
                <p className="today-item-text">{note.note_text}</p>
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
