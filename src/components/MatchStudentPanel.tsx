import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { supabase } from "../lib/supabase";
import { closestStudents, normaliseStudentName, type MatchableStudent } from "../lib/touchPoints";

export type PickerStudent = MatchableStudent & { student_name: string };

type MatchStudentPanelProps<T extends PickerStudent> = {
  // Null when the note has not been saved yet, as on a bulk upload preview.
  // There is no row to point at, so nothing is written and the choice is
  // simply handed back to whoever opened the picker.
  noteId: string | null;
  typedName: string;
  candidates: T[];
  students: T[];
  onMatched: (student: T) => void;
  onClose: () => void;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function MatchStudentPanel<T extends PickerStudent>({
  noteId,
  typedName,
  candidates,
  students,
  onMatched,
  onClose,
}: MatchStudentPanelProps<T>) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Focus moves into the panel on open and returns to whatever opened it on
  // close, without the opener having to pass a ref down. The panel itself
  // takes focus first so its heading is announced before the options.
  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Escape is bound to the document rather than the panel, so it still works
  // after a click lands on a heading or a gap rather than on a control.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    if (searching) {
      const needle = normaliseStudentName(query);
      if (!needle) return [];
      return students.filter((student) =>
        normaliseStudentName(student.student_name).includes(needle),
      );
    }
    return candidates.length > 0 ? candidates : closestStudents(typedName, students);
  }, [searching, query, students, candidates, typedName]);

  async function handlePick(student: T) {
    if (busy) return;
    if (!noteId) {
      onMatched(student);
      return;
    }
    setBusy(true);
    setMessage(null);
    // The id is what the app matches on from now on. The name is overwritten
    // too, so the nightly job, which only reads the typed name, matches it
    // the same way.
    const { error } = await supabase
      .from("daily_notes")
      .update({ student_id: student.id, student_name: student.student_name })
      .eq("id", noteId);
    setBusy(false);
    if (error) {
      setMessage("The note could not be matched. Please try again.");
      return;
    }
    onMatched(student);
  }

  // Tab cycles inside the panel while it is open and never escapes it.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].filter((el) => !el.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const onPanel = document.activeElement === panelRef.current;
    if (event.shiftKey && (document.activeElement === first || onPanel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="match-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="match-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-panel-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="match-panel-title" id="match-panel-title">
          Which student is this
        </p>
        <p className="match-panel-sub">
          You typed <span className="match-typed">{typedName || "nothing"}</span>. Tap the right
          one.
        </p>

        {searching ? (
          <>
            <label className="field-label" htmlFor="match-search">
              Search the full list
            </label>
            <input
              id="match-search"
              className="text-field match-search-field"
              type="search"
              value={query}
              placeholder="Student name"
              onChange={(event) => setQuery(event.target.value)}
            />
          </>
        ) : null}

        {shown.length > 0 ? (
          <ul className="match-list">
            {shown.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  className="match-option"
                  disabled={busy}
                  onClick={() => handlePick(student)}
                >
                  <span className="match-option-name">{student.student_name}</span>
                  <span className="match-option-parent">
                    {student.parent_name ?? "No parent name"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="match-panel-empty">
            {searching && query.trim()
              ? "Nobody on the roster matches that."
              : searching
                ? "Start typing to find a student."
                : "There are no active students to choose from."}
          </p>
        )}

        {searching ? null : (
          <button type="button" className="match-search-link" onClick={() => setSearching(true)}>
            Neither of these, search the full list
          </button>
        )}

        {message ? (
          <p className="match-panel-message" role="alert">
            {message}
          </p>
        ) : null}

        <button type="button" className="match-cancel" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
