import { useState } from "react";
import { formatSydneyTime, sydneyDateIso } from "../lib/dates";
import {
  rankStudents,
  searchStudents,
  type CalendlyMismatch,
  type RankableStudent,
} from "../lib/mismatch";
import { supabase } from "../lib/supabase";
import type { SavedContactLog } from "./LogContactPanel";

type MismatchStudent = RankableStudent;

type MismatchPanelProps<T extends MismatchStudent> = {
  mismatches: CalendlyMismatch[];
  students: T[];
  onResolved: (id: number | string) => void;
  onLogged: (log: SavedContactLog) => void;
  onClose: () => void;
};

const COLUMNS = "id, invitee_name, student_name_given, event_start_time, reviewed";

function eventWhen(startTime: string | null): string {
  if (!startTime) return "No time recorded";
  const when = new Date(startTime);
  if (Number.isNaN(when.getTime())) return "No time recorded";
  return `${sydneyDateIso(when)}, ${formatSydneyTime(when)}`;
}

// The date the contact is recorded against: the Sydney date of the booking,
// falling back to today only when the booking carries no time at all.
function contactDate(startTime: string | null): string {
  const when = startTime ? new Date(startTime) : new Date();
  return sydneyDateIso(Number.isNaN(when.getTime()) ? new Date() : when);
}

// An inline panel, never a dialog. Ranking only orders the candidates: every
// match takes an explicit tap, because a wrong attribution writes a completed
// P2 against the wrong student.
export function MismatchPanel<T extends MismatchStudent>({
  mismatches,
  students,
  onResolved,
  onLogged,
  onClose,
}: MismatchPanelProps<T>) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissed, setDismissed] = useState<CalendlyMismatch[] | null>(null);

  async function handleMatch(mismatch: CalendlyMismatch, student: T) {
    if (busyId) return;
    setBusyId(String(mismatch.id));
    setMessage(null);
    const { data, error } = await supabase
      .from("contact_log")
      .insert({
        student_id: student.id,
        date_contacted: contactDate(mismatch.event_start_time),
        method: "FULL P2",
        outcome: "Reached",
        // Set explicitly: a row without it would sort as the newest entry
        // forever and pin the student as complete.
        logged_at: new Date().toISOString(),
      })
      .select("id, student_id, method, outcome, logged_at, date_contacted")
      .single();
    if (error || !data) {
      setBusyId(null);
      setMessage("The contact could not be saved, so nothing was changed.");
      return;
    }
    const { error: markError } = await supabase
      .from("calendly_mismatches")
      .update({ reviewed: true })
      .eq("id", mismatch.id);
    setBusyId(null);
    if (markError) {
      // The contact landed, so say so rather than implying nothing happened.
      onLogged(data as SavedContactLog);
      setMessage("The contact was saved, but the booking could not be cleared. Try again.");
      return;
    }
    onLogged(data as SavedContactLog);
    onResolved(mismatch.id);
  }

  async function handleDismiss(mismatch: CalendlyMismatch) {
    if (busyId) return;
    setBusyId(String(mismatch.id));
    setMessage(null);
    const { error } = await supabase
      .from("calendly_mismatches")
      .update({ reviewed: true })
      .eq("id", mismatch.id);
    setBusyId(null);
    if (error) {
      setMessage("The booking could not be set aside. Please try again.");
      return;
    }
    setConfirmingId(null);
    setDismissed(null);
    onResolved(mismatch.id);
  }

  async function loadDismissed() {
    const { data } = await supabase
      .from("calendly_mismatches")
      .select(COLUMNS)
      .eq("reviewed", true)
      .order("event_start_time", { ascending: false });
    setDismissed((data ?? []) as CalendlyMismatch[]);
  }

  async function handleRestore(mismatch: CalendlyMismatch) {
    if (busyId) return;
    setBusyId(String(mismatch.id));
    setMessage(null);
    const { error } = await supabase
      .from("calendly_mismatches")
      .update({ reviewed: false })
      .eq("id", mismatch.id);
    setBusyId(null);
    if (error) {
      setMessage("The booking could not be brought back. Please try again.");
      return;
    }
    await loadDismissed();
    onResolved(mismatch.id);
  }

  return (
    <div className="roster-panel mismatch-panel">
      <p className="roster-panel-title">Unmatched Calendly bookings</p>
      <p className="roster-panel-text">
        These parents booked a meeting that could not be matched to a student. Matching one records
        a FULL P2 with Reached against that student, so check the name before you tap.
      </p>

      <ul className="mismatch-list">
        {mismatches.map((mismatch) => {
          const key = String(mismatch.id);
          const query = queries[key] ?? "";
          const suggestions = rankStudents(mismatch, students, 3);
          const found = query.trim() ? searchStudents(query, students).slice(0, 6) : [];
          const busy = busyId === key;
          return (
            <li key={key} className="mismatch-item">
              <div className="mismatch-head">
                <p className="mismatch-invitee">{mismatch.invitee_name ?? "No invitee name"}</p>
                <p className="mismatch-meta">Typed: {mismatch.student_name_given || "nothing"}</p>
                <p className="mismatch-meta">{eventWhen(mismatch.event_start_time)}</p>
              </div>

              {suggestions.length > 0 ? (
                <>
                  <p className="mismatch-section-label">Likely matches</p>
                  <div className="mismatch-options">
                    {suggestions.map(({ student }) => (
                      <button
                        key={student.id}
                        type="button"
                        className="mismatch-option"
                        disabled={busy}
                        onClick={() => handleMatch(mismatch, student)}
                      >
                        <span className="mismatch-option-name">{student.student_name}</span>
                        <span className="mismatch-option-parent">
                          {student.parent_name ?? "No parent name"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="roster-panel-text">
                  No close match on the roster. Search for the student below.
                </p>
              )}

              <label className="field-label" htmlFor={`mismatch-search-${key}`}>
                Search the roster
              </label>
              <input
                id={`mismatch-search-${key}`}
                className="text-field log-input"
                type="search"
                value={query}
                placeholder="Student or parent name"
                onChange={(event) =>
                  setQueries((current) => ({ ...current, [key]: event.target.value }))
                }
              />
              {found.length > 0 ? (
                <div className="mismatch-options">
                  {found.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className="mismatch-option"
                      disabled={busy}
                      onClick={() => handleMatch(mismatch, student)}
                    >
                      <span className="mismatch-option-name">{student.student_name}</span>
                      <span className="mismatch-option-parent">
                        {student.parent_name ?? "No parent name"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <p className="roster-panel-text">Nobody on the roster matches that.</p>
              ) : null}

              <div className="roster-panel-actions">
                {confirmingId === key ? (
                  <>
                    <span className="mismatch-confirm-note">
                      Set aside with no contact recorded?
                    </span>
                    <button
                      type="button"
                      className="row-button"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-button roster-panel-save button-danger"
                      disabled={busy}
                      onClick={() => handleDismiss(mismatch)}
                    >
                      {busy ? "Setting aside..." : "Yes, set aside"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="row-button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingId(key);
                      setMessage(null);
                    }}
                  >
                    Not a P2
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {message ? (
        <p className="roster-panel-message" role="alert">
          {message}
        </p>
      ) : null}

      <div className="mismatch-dismissed">
        <button
          type="button"
          className="mismatch-dismissed-toggle"
          aria-expanded={showDismissed}
          onClick={() => {
            const next = !showDismissed;
            setShowDismissed(next);
            if (next && dismissed === null) void loadDismissed();
          }}
        >
          {showDismissed ? "Hide bookings set aside" : "Show bookings set aside"}
        </button>
        {showDismissed ? (
          dismissed === null ? (
            <p className="roster-panel-text">Loading</p>
          ) : dismissed.length === 0 ? (
            <p className="roster-panel-text">Nothing has been set aside.</p>
          ) : (
            <ul className="history-list">
              {dismissed.map((mismatch) => (
                <li key={mismatch.id} className="history-entry">
                  <div className="history-details">
                    <p className="history-line">{mismatch.invitee_name ?? "No invitee name"}</p>
                    <p className="history-when">
                      {mismatch.student_name_given || "nothing typed"},{" "}
                      {eventWhen(mismatch.event_start_time)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="row-button"
                    disabled={busyId === String(mismatch.id)}
                    onClick={() => handleRestore(mismatch)}
                  >
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
