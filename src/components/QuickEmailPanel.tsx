import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import { supabase } from "../lib/supabase";
import {
  assembleDraft,
  effectiveTopics,
  scheduleQuickEmail,
  type QuickEmailRow,
} from "../lib/quickEmail";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// The write is this one insert: the single quick_emails row, nothing else.
// No daily_notes write, no Gmail, no other table.
const insertRow = async (row: QuickEmailRow): Promise<{ error: unknown }> => {
  const { error } = await supabase.from("quick_emails").insert(row);
  return { error };
};

type QuickEmailPanelProps = {
  studentId: string | number;
  studentName: string;
  parentName: string | null;
  parentEmail: string | null;
  // The chips to offer.
  topics: string[];
  onClose: () => void;
  // The chosen topics, handed back so the screen can move the family out of
  // red at once.
  onScheduled: (topics: string[]) => void;
};

// The quick email panel, a modal opened from a table row and from the
// contact first card alike. It assembles a draft, writes one quick_emails
// row on Schedule, and does nothing else. The nightly job drafts the real
// email from that row later.
export function QuickEmailPanel({
  studentId,
  studentName,
  parentName,
  parentEmail,
  topics,
  onClose,
  onScheduled,
}: QuickEmailPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [offer, setOffer] = useState(false);
  // Seeded with the draft for the opening state, so the preview is there on
  // the first paint rather than only after the effect runs.
  const [body, setBody] = useState(() =>
    assembleDraft({ parentName, studentName, topics: [], offerScreenshots: false }),
  );
  // Once the person edits the draft, the chips stop rewriting it under them.
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  const chosen = effectiveTopics(selected, custom);

  // Keep the preview in step with the chips until the person takes the pen.
  useEffect(() => {
    if (edited) return;
    setBody(
      assembleDraft({
        parentName,
        studentName,
        topics: effectiveTopics(selected, custom),
        offerScreenshots: offer,
      }),
    );
  }, [selected, custom, offer, edited, parentName, studentName]);

  // Focus into the panel on open, back to the opener on close.
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

  function toggleTopic(topic: string) {
    setSelected((current) =>
      current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic],
    );
  }

  async function handleCopy() {
    const ok = await copyText(body);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleSchedule() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await scheduleQuickEmail(
      { insert: insertRow },
      {
        studentId,
        parentEmail,
        topics: chosen,
        offerScreenshots: offer,
        body,
      },
    );
    if (!result.ok) {
      setBusy(false);
      setMessage("The draft could not be scheduled. Please try again.");
      return;
    }
    // The screen folds this into the counts and shows the confirmation.
    onScheduled(chosen);
    onClose();
  }

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
      className="match-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="match-panel quick-email-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Draft a quick email about ${studentName}`}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="match-panel-title">Draft email about {studentName}</p>
        <p className="match-panel-sub">
          This writes a draft for tonight. The email is drafted later, not sent now.
        </p>

        <p className="quick-email-field-label">What to mention</p>
        <div className="quick-email-chips" role="group" aria-label="Topics to mention">
          {topics.map((topic) => {
            const on = selected.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                className={`quick-email-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleTopic(topic)}
              >
                {topic}
              </button>
            );
          })}
        </div>

        <label className="field-label" htmlFor="quick-email-custom">
          Add your own
        </label>
        <input
          id="quick-email-custom"
          className="text-field quick-email-custom"
          type="text"
          value={custom}
          placeholder="Something else to mention"
          onChange={(event) => setCustom(event.target.value)}
        />

        <label className="quick-email-toggle">
          <input
            type="checkbox"
            checked={offer}
            onChange={(event) => setOffer(event.target.checked)}
          />
          <span>Offer to send screenshots of how it is done now</span>
        </label>

        <label className="field-label" htmlFor="quick-email-body">
          Preview
        </label>
        <textarea
          id="quick-email-body"
          className="text-field text-area quick-email-body"
          rows={9}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setEdited(true);
          }}
        />

        {message ? (
          <p className="roster-panel-message" role="alert">
            {message}
          </p>
        ) : null}

        <div className="roster-panel-actions quick-email-actions">
          <button type="button" className="row-button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="row-button" onClick={() => void handleCopy()}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="primary-button roster-panel-save quick-email-schedule"
            disabled={busy}
            onClick={() => void handleSchedule()}
          >
            {busy ? "Scheduling..." : "Schedule Draft Tonight"}
          </button>
        </div>
      </div>
    </div>
  );
}
