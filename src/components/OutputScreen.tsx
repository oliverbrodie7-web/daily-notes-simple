import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import { sydneyTodayIso } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { TickIcon } from "./Icons";

type OutputNote = {
  id: string;
  student_name: string;
  note_text: string;
  created_at: string;
  draft_created: boolean;
};

function noteAsText(note: OutputNote): string {
  return `${note.student_name}\n${note.note_text}`;
}

export function OutputScreen() {
  const [notes, setNotes] = useState<OutputNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes")
      .select("id, student_name, note_text, created_at, draft_created")
      .eq("note_date", sydneyTodayIso())
      .eq("collated", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadFailed(true);
          setNotes([]);
          return;
        }
        setNotes((data ?? []) as OutputNote[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  async function handleCopy(key: string, text: string) {
    const copied = await copyText(text);
    if (!copied) {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopiedKey(key);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
  }

  const loading = notes === null;
  const hasNotes = !loading && !loadFailed && notes.length > 0;
  const countLabel =
    hasNotes && `${notes.length} ${notes.length === 1 ? "student" : "students"}, collated 7:30 pm`;
  const allText = hasNotes ? notes.map(noteAsText).join("\n\n") : "";

  return (
    <section className="output-screen">
      <div className="output-head">
        <div>
          <h2 className="section-heading">Tonight's output</h2>
          {countLabel ? <p className="output-count">{countLabel}</p> : null}
        </div>
        {hasNotes ? (
          <button
            type="button"
            className="copy-all-button"
            onClick={() => handleCopy("all", allText)}
          >
            {copiedKey === "all" ? "Copied" : "Copy all"}
          </button>
        ) : null}
      </div>

      {copyFailed ? (
        <p className="output-message" role="alert">
          The text could not be copied.
        </p>
      ) : null}

      {loading ? (
        <p className="output-message">Loading tonight's notes</p>
      ) : loadFailed ? (
        <p className="output-message" role="alert">
          Today's output could not be loaded. Please try again.
        </p>
      ) : notes.length === 0 ? (
        <p className="output-message">Nothing yet. Today's notes appear here after 7:30 pm.</p>
      ) : (
        <ul className="output-grid">
          {notes.map((note) => (
            <li key={note.id} className="output-card">
              <h3 className="output-card-name">{note.student_name}</h3>
              <p className="output-card-text">{note.note_text}</p>
              <div className="output-card-foot">
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopy(note.id, noteAsText(note))}
                >
                  {copiedKey === note.id ? "Copied" : "Copy"}
                </button>
                {note.draft_created ? (
                  <span className="draft-flag">
                    <TickIcon />
                    Draft created
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
