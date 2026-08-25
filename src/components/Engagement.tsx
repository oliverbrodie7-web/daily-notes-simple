import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatSydneyShortDate } from "../lib/dates";
import {
  LEVEL_LABELS,
  LEVEL_SEGMENTS,
  engagementSummary,
  lastEmailLine,
  lastEmailTone,
  type Engagement,
} from "../lib/engagement";

const SEGMENTS = [0, 1, 2, 3, 4];
const PANEL_EMAIL_LIMIT = 15;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type BarProps = {
  engagement: Engagement;
  // False while today is still inside the first fortnight, when nothing is
  // counting yet and the column says so.
  counting: boolean;
  studentName: string;
  // Left off on the board, where the whole card is the button and a second
  // one inside it would be neither valid nor tappable.
  onOpen?: () => void;
};

function Segments({ level, counting }: { level: Engagement["level"]; counting: boolean }) {
  const filled = counting ? LEVEL_SEGMENTS[level] : 0;
  return (
    <span className="engage-segments" aria-hidden="true">
      {SEGMENTS.map((index) => (
        <span
          key={index}
          className={`engage-segment${index < filled ? ` is-on engage-${level}` : ""}`}
        />
      ))}
    </span>
  );
}

// A real button only when there is something to open, and only when the
// caller wants one. With nothing to show it is a plain element, so it never
// sits in the tab order as a dead control. That element is a span rather
// than a div so it stays legal inside the board's card button.
export function EngagementBar({ engagement, counting, studentName, onOpen }: BarProps) {
  const { level, emails, daysSinceLast } = engagement;

  if (!counting) {
    return (
      <span className="engage">
        <Segments level="none" counting={false} />
        <span className="engage-label engage-waiting">Counting from week 3</span>
      </span>
    );
  }

  const line = lastEmailLine(daysSinceLast);
  const tone = lastEmailTone(daysSinceLast);
  const body = (
    <>
      <Segments level={level} counting />
      <span className={`engage-label engage-${level}`}>{LEVEL_LABELS[level]}</span>
      <span className={`engage-last engage-last-${tone}`}>{line}</span>
    </>
  );

  if (emails.length === 0 || !onOpen) {
    return (
      <span className="engage">
        {body}
        <span className="visually-hidden">
          {studentName}: {LEVEL_LABELS[level]}. {line}.
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="engage engage-button"
      aria-label={`${studentName}: ${LEVEL_LABELS[level]}. ${line}. Open the email history.`}
      onClick={onOpen}
    >
      {body}
    </button>
  );
}

type PanelProps = {
  studentName: string;
  parentName: string | null;
  engagement: Engagement;
  onClose: () => void;
};

function weightTag(weight: number): string {
  return weight < 1 ? "A third" : "Full";
}

// One line, whatever the subject does.
function oneLine(subject: string | null): string {
  const trimmed = (subject ?? "").trim().replace(/\s+/g, " ");
  return trimmed || "No subject";
}

export function EngagementPanel({ studentName, parentName, engagement, onClose }: PanelProps) {
  const { level, emails, score } = engagement;
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
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
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

  const shown = emails.slice(0, PANEL_EMAIL_LIMIT);
  const more = emails.length - shown.length;

  return (
    <div
      className="engage-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="engage-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="engage-panel-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="engage-panel-title" id="engage-panel-title">
          {studentName}
        </p>
        <p className="engage-panel-sub">
          {parentName ?? "No parent name"}
          {emails.length > 0 ? (
            <>
              <span className="engage-panel-dot" aria-hidden="true">
                {"·"}
              </span>
              <span className={`engage-${level}`}>{LEVEL_LABELS[level]}</span>
              <span className="engage-panel-dot" aria-hidden="true">
                {"·"}
              </span>
              {emails.length} {emails.length === 1 ? "email" : "emails"} this term
            </>
          ) : null}
        </p>

        {emails.length === 0 ? (
          <p className="engage-panel-empty">This parent has not emailed us this term.</p>
        ) : (
          <>
            <ul className="engage-list">
              {shown.map((entry, index) => (
                // Indexed, because two emails arriving in the same instant
                // would collide on the timestamp.
                <li key={index} className="engage-entry">
                  <span className="engage-entry-date">
                    {formatSydneyShortDate(entry.receivedAt.slice(0, 10))}
                  </span>
                  <span className="engage-entry-subject">{oneLine(entry.subject)}</span>
                  <span className={`engage-tag${entry.weight < 1 ? " engage-tag-third" : ""}`}>
                    {weightTag(entry.weight)}
                  </span>
                </li>
              ))}
            </ul>
            {more > 0 ? (
              <p className="engage-panel-more">
                {more} more {more === 1 ? "email" : "emails"} not shown.
              </p>
            ) : null}
            <p className="engage-panel-summary">{engagementSummary(engagement)}</p>
            <p className="engage-panel-score">Weight this term: {score.toFixed(2)}</p>
          </>
        )}

        <div className="engage-panel-actions">
          <button type="button" className="row-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
