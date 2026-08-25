import { formatSydneyFullDate, formatSydneyTime } from "../lib/dates";

// A student's contact history, in one place.
//
// The table expands it under a row and the board expands it under a card.
// The wording, the order and the delete control come from here either way,
// so the two views can never disagree about what a student's history is.

// The shape this panel needs. A caller's row may carry more than this, and
// it hands its own row back to onDelete, so nothing has to be rebuilt or
// looked up again on the way out.
export type HistoryEntry = {
  id: string | number;
  method: string | null;
  outcome: string | null;
  date_contacted: string | null;
  logged_at: string | null;
};

type ContactHistoryPanelProps<T extends HistoryEntry> = {
  studentName: string;
  entries: T[];
  // The entry currently being removed, so its own button says so and the
  // rest stay usable.
  busyId: string | number | null;
  message: string | null;
  onDelete: (entry: T) => void;
  onClose: () => void;
};

export function ContactHistoryPanel<T extends HistoryEntry>({
  studentName,
  entries,
  busyId,
  message,
  onDelete,
  onClose,
}: ContactHistoryPanelProps<T>) {
  return (
    <div className="roster-panel">
      <p className="roster-panel-title">Contact history for {studentName}</p>
      {entries.length === 0 ? (
        <p className="roster-panel-text">No contact logged yet.</p>
      ) : (
        <ul className="history-list">
          {entries.map((entry) => (
            <li key={entry.id} className="history-entry">
              <div className="history-details">
                <p className="history-line">
                  {entry.method ?? "Unknown"}, {entry.outcome ?? "unknown"}
                </p>
                <p className="history-when">
                  {entry.date_contacted ? formatSydneyFullDate(entry.date_contacted) : "No date"}
                  {entry.logged_at ? `, logged ${formatSydneyTime(entry.logged_at)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="row-button row-button-danger"
                disabled={busyId === entry.id}
                onClick={() => onDelete(entry)}
              >
                {busyId === entry.id ? "Removing..." : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message ? (
        <p className="roster-panel-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
