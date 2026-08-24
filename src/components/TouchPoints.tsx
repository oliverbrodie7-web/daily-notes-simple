import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatSydneyFullDate } from "../lib/dates";
import { touchPointsLine, type TouchPointSummary } from "../lib/touchPoints";

// A student's touch points for the term, in one place.
//
// The Parents screen shows this inline under a row and the Today screen
// shows it in a panel over the list, but the wording, the dates and the
// order come from here either way, so the two screens can never disagree
// about what a student's history is.

type TouchPointsBodyProps = {
  studentName: string;
  touch: TouchPointSummary;
};

export function TouchPointsBody({ studentName, touch }: TouchPointsBodyProps) {
  return (
    <>
      <p className="roster-panel-title">Touch points for {studentName}</p>
      <p className="roster-panel-text">
        Notes taken on the Today screen. These do not count towards P2 and never change the status
        badge.
      </p>
      <ul className="history-list">
        {touch.entries.map((entry, index) => (
          <li key={`${entry.date}-${index}`} className="history-entry">
            <div className="history-details">
              <p className="history-line">
                {entry.date ? formatSydneyFullDate(entry.date) : "No date"}
                {entry.addedBy ? `, ${entry.addedBy}` : ""}
              </p>
              <p className="history-when">{entry.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type TouchPointsDialogProps = TouchPointsBodyProps & {
  onClose: () => void;
};

// The Today screen's way in. The list underneath is where a person is
// working, so this closes on escape and on a tap outside, and hands focus
// back to the line that opened it.
export function TouchPointsDialog({ studentName, touch, onClose }: TouchPointsDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (el) => !el.hasAttribute("disabled"),
    );
    const first = items[0];
    const last = items[items.length - 1];
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
      className="touch-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="touch-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${studentName}, ${touchPointsLine(touch.count).toLowerCase()}`}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <TouchPointsBody studentName={studentName} touch={touch} />
        <div className="roster-panel-actions">
          <button type="button" className="row-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
