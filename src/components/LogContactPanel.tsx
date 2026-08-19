import { useEffect, useState } from "react";
import { sydneyTodayIso } from "../lib/dates";
import { CONTACT_METHODS, OUTCOMES_BY_METHOD, type ContactMethod } from "../lib/p2";
import { supabase } from "../lib/supabase";

export type SavedContactLog = {
  id: number | string;
  student_id: number | string;
  method: string | null;
  outcome: string | null;
  logged_at: string | null;
  date_contacted: string | null;
};

type LogContactPanelProps = {
  studentId: number | string;
  studentName: string;
  onClose: () => void;
  onSaved: (log: SavedContactLog) => void;
};

// An inline panel, never a dialog: it expands in place under the student's
// row so it stays dependable on iPad Safari. The vocabulary mirrors the old
// tracker exactly, and a method with a single outcome selects it for you.
export function LogContactPanel({
  studentId,
  studentName,
  onClose,
  onSaved,
}: LogContactPanelProps) {
  const [date, setDate] = useState(sydneyTodayIso);
  const [method, setMethod] = useState<ContactMethod | "">("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A method with one outcome selects it. A method with none clears the
  // outcome entirely, so the row saves empty rather than with a
  // placeholder word.
  useEffect(() => {
    if (!method) {
      setOutcome("");
      return;
    }
    const allowed = OUTCOMES_BY_METHOD[method];
    if (allowed.length === 0) {
      setOutcome("");
      return;
    }
    if (!allowed.includes(outcome)) {
      setOutcome(allowed.length === 1 ? (allowed[0] ?? "") : "");
    }
  }, [method, outcome]);

  async function handleSave() {
    if (saving) return;
    if (!method) {
      setMessage("Choose a method.");
      return;
    }
    // Only ask for an outcome when this method offers any.
    if (OUTCOMES_BY_METHOD[method].length > 0 && !outcome) {
      setMessage("Choose an outcome.");
      return;
    }
    if (!date) {
      setMessage("Choose a date.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("contact_log")
      .insert({
        student_id: studentId,
        date_contacted: date,
        method,
        outcome,
        logged_at: new Date().toISOString(),
      })
      .select("id, student_id, method, outcome, logged_at, date_contacted")
      .single();
    setSaving(false);
    if (error || !data) {
      setMessage("The contact could not be saved. Please try again.");
      return;
    }
    onSaved(data as SavedContactLog);
  }

  const outcomes = method ? OUTCOMES_BY_METHOD[method] : [];

  return (
    <div className="roster-panel">
      <p className="roster-panel-title">Log contact for {studentName}</p>
      <div className="log-fields">
        <div className="log-field">
          <label className="field-label" htmlFor="log-date">
            Date
          </label>
          <input
            id="log-date"
            className="text-field log-input"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setMessage(null);
            }}
          />
        </div>
        <div className="log-field">
          <label className="field-label" htmlFor="log-method">
            Method
          </label>
          <select
            id="log-method"
            className="text-field log-input"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as ContactMethod | "");
              setMessage(null);
            }}
          >
            <option value="">Choose</option>
            {CONTACT_METHODS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
        {outcomes.length > 0 ? (
          <div className="log-field">
            <label className="field-label" htmlFor="log-outcome">
              Outcome
            </label>
            <select
              id="log-outcome"
              className="text-field log-input"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setMessage(null);
              }}
            >
              <option value="">Choose</option>
              {outcomes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {message ? (
        <p className="roster-panel-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button roster-panel-save"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving..." : "Save contact"}
        </button>
      </div>
    </div>
  );
}
