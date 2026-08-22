import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import { formatSydneyFullDate, formatSydneyTime } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { ScreenBar } from "./ScreenBar";
import { ChevronLeftIcon, ChevronRightIcon, TickIcon, WarningIcon } from "./Icons";

type OutputNote = {
  id: string;
  student_name: string;
  note_text: string;
  tidied_text: string | null;
  created_at: string;
  draft_created: boolean;
  no_match: boolean;
  added_by: string | null;
};

// The tidied wording is the note shown and copied when the nightly job has
// produced one that differs from the original. Otherwise the original stands
// alone, exactly as before tidying existed.
function cardText(note: OutputNote): string {
  const tidied = (note.tidied_text ?? "").trim();
  if (!tidied || tidied === note.note_text.trim()) return note.note_text;
  return tidied;
}

function showsOriginal(note: OutputNote): boolean {
  const tidied = (note.tidied_text ?? "").trim();
  return tidied !== "" && tidied !== note.note_text.trim();
}

function noteAsText(note: OutputNote): string {
  return `${note.student_name}\n${cardText(note)}`;
}

export function OutputScreen() {
  const [dates, setDates] = useState<string[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [notes, setNotes] = useState<OutputNote[] | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function fetchBatch(date: string) {
    setBatchLoading(true);
    setLoadFailed(false);
    const { data, error } = await supabase
      .from("daily_notes")
      .select(
        "id, student_name, note_text, tidied_text, created_at, draft_created, no_match, added_by",
      )
      .eq("note_date", date)
      .eq("collated", true)
      .order("created_at", { ascending: false });
    if (!alive.current) return;
    setBatchLoading(false);
    if (error) {
      setLoadFailed(true);
      return;
    }
    setNotes((data ?? []) as OutputNote[]);
  }

  // The list of dates loads once each time the screen is opened, so a batch
  // collated while the app sat on another screen is picked up on return.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("daily_notes")
        .select("note_date")
        .eq("collated", true)
        .order("note_date", { ascending: false });
      if (!alive.current) return;
      if (error) {
        setLoadFailed(true);
        setDates([]);
        setNotes([]);
        return;
      }
      const distinct = [
        ...new Set((data ?? []).map((row) => (row as { note_date: string }).note_date)),
      ];
      setDates(distinct);
      const newest = distinct[0];
      if (!newest) {
        setNotes([]);
        return;
      }
      setSelectedDate(newest);
      await fetchBatch(newest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedIndex = dates && selectedDate ? dates.indexOf(selectedDate) : -1;
  const hasOlder = selectedIndex >= 0 && dates !== null && selectedIndex < dates.length - 1;
  const hasNewer = selectedIndex > 0;

  function showOlder() {
    if (!dates || !hasOlder || batchLoading) return;
    const next = dates[selectedIndex + 1];
    if (!next) return;
    setSelectedDate(next);
    void fetchBatch(next);
  }

  function showNewer() {
    if (!dates || !hasNewer || batchLoading) return;
    const next = dates[selectedIndex - 1];
    if (!next) return;
    setSelectedDate(next);
    void fetchBatch(next);
  }

  async function handleCopy(key: string, text: string) {
    const copied = await copyText(text);
    if (!alive.current) return;
    if (!copied) {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopiedKey(key);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
  }

  const initialLoading = dates === null || (notes === null && !loadFailed);
  const noBatches = dates !== null && dates.length === 0 && !loadFailed;
  const hasNotes = !initialLoading && !loadFailed && notes !== null && notes.length > 0;
  const allText = hasNotes ? notes.map(noteAsText).join("\n\n") : "";
  const noMatchNames = hasNotes
    ? notes.filter((note) => note.no_match).map((note) => note.student_name)
    : [];
  const collatedAt = hasNotes ? formatSydneyTime(notes[0]!.created_at) : "";
  const heading = selectedDate && !noBatches ? formatSydneyFullDate(selectedDate) : "Output";
  const subline = batchLoading
    ? "Loading"
    : noBatches
      ? "Nothing collated yet"
      : hasNotes
        ? `${notes.length} ${notes.length === 1 ? "student" : "students"}, collated ${collatedAt}`
        : "";

  return (
    <section className="output-screen">
      <ScreenBar title="Output" subtitle={initialLoading ? null : heading}>
        <button
          type="button"
          className="date-arrow"
          aria-label="Older batch"
          disabled={!hasOlder}
          onClick={showOlder}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="date-arrow"
          aria-label="Newer batch"
          disabled={!hasNewer}
          onClick={showNewer}
        >
          <ChevronRightIcon />
        </button>
      </ScreenBar>

      {subline ? <p className="output-count output-count-line">{subline}</p> : null}

      {noMatchNames.length > 0 ? (
        <div className="output-warning">
          <WarningIcon className="output-warning-icon" size={20} />
          <div className="output-warning-body">
            <p className="output-warning-title">
              {noMatchNames.length === 1
                ? "1 name did not match a student"
                : `${noMatchNames.length} names did not match a student`}
            </p>
            <p className="output-warning-text">
              No email draft was created for these. Check the spelling against your student list.
            </p>
            <p className="output-warning-names">{noMatchNames.join(", ")}</p>
          </div>
        </div>
      ) : null}

      {hasNotes ? (
        <div className="output-actions">
          <button
            type="button"
            className="copy-all-button"
            onClick={() => handleCopy("all", allText)}
          >
            {copiedKey === "all" ? "Copied" : "Copy all"}
          </button>
        </div>
      ) : null}

      {copyFailed ? (
        <p className="output-message" role="alert">
          The text could not be copied.
        </p>
      ) : null}

      {initialLoading ? (
        <p className="output-message">Loading the output</p>
      ) : loadFailed ? (
        <p className="output-message" role="alert">
          The output could not be loaded. Please try again.
        </p>
      ) : noBatches ? (
        <p className="output-message">Nothing yet. Your first batch appears after 7:30 pm.</p>
      ) : notes !== null && notes.length === 0 ? (
        <p className="output-message">Nothing collated on this date.</p>
      ) : (
        <ul className={`output-grid${batchLoading ? " is-loading" : ""}`}>
          {(notes ?? []).map((note) => (
            <li key={note.id} className="output-card">
              <h3 className="output-card-name">{note.student_name}</h3>
              <p className="output-card-text">{cardText(note)}</p>
              {showsOriginal(note) ? (
                <div className="output-card-original">
                  <span className="output-card-original-label">As typed</span>
                  <p className="output-card-original-text">{note.note_text}</p>
                </div>
              ) : null}
              {note.added_by ? (
                <p className="output-card-by output-card-by-block">Added by {note.added_by}</p>
              ) : null}
              <div className="output-card-foot">
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => handleCopy(note.id, noteAsText(note))}
                >
                  {copiedKey === note.id ? "Copied" : "Copy"}
                </button>
                <span className="output-card-foot-right">
                  {note.added_by ? (
                    <span className="output-card-by output-card-by-inline">
                      Added by {note.added_by}
                    </span>
                  ) : null}
                  {note.no_match ? (
                    <span className="no-match-flag">No match</span>
                  ) : note.draft_created ? (
                    <span className="draft-flag">
                      <TickIcon />
                      Draft created
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
