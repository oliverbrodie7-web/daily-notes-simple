import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import { supabase } from "../lib/supabase";
import {
  assembleTwoTemplateDraft,
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

type Choice = "positive" | "bookchat";

const CHOICE_LABEL: Record<Choice, string> = {
  positive: "Positive",
  bookchat: "Book a chat",
};

type QuickEmailPanelProps = {
  studentId: string | number;
  studentName: string;
  parentName: string | null;
  parentEmail: string | null;
  // The two fixed template bodies and the Calendly link, already falling back
  // to their built-in values when the settings column was empty.
  positive: string;
  bookchat: string;
  calendlyLink: string;
  onClose: () => void;
  // The chosen template name, handed back as a single item array so the screen
  // can move the family out of red at once and the history line still reads.
  onScheduled: (topics: string[]) => void;
};

// The quick email panel, a modal opened from a table row and from the contact
// first card alike. The user picks one of two fixed templates, glances at the
// preview and schedules. On Schedule it writes one quick_emails row and does
// nothing else. The nightly job drafts the real email from that row later.
export function QuickEmailPanel({
  studentId,
  studentName,
  parentName,
  parentEmail,
  positive,
  bookchat,
  calendlyLink,
  onClose,
  onScheduled,
}: QuickEmailPanelProps) {
  // Which of the two templates, defaulted to Positive, and the optional topic
  // the positive template can fold in.
  const [choice, setChoice] = useState<Choice>("positive");
  const [topic, setTopic] = useState("");

  // Seeded with the opening draft, so the preview is there on the first paint
  // rather than only after the effect runs.
  const [body, setBody] = useState(() =>
    assembleTwoTemplateDraft({
      parentName,
      studentName,
      template: positive,
      topic: "",
      link: calendlyLink,
    }),
  );
  // Once the person edits the draft, the choice stops rewriting it under them.
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Keep the preview in step with the choice and topic until the person takes
  // the pen. Book a chat ignores the topic.
  useEffect(() => {
    if (edited) return;
    const template = choice === "positive" ? positive : bookchat;
    const topicForFill = choice === "positive" ? topic : "";
    setBody(
      assembleTwoTemplateDraft({
        parentName,
        studentName,
        template,
        topic: topicForFill,
        link: calendlyLink,
      }),
    );
  }, [choice, topic, positive, bookchat, calendlyLink, edited, parentName, studentName]);

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

  async function handleCopy() {
    const ok = await copyText(body);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleSchedule() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    // A single item array naming the chosen template, kept only so the history
    // line still reads. The email itself is the body text below.
    const topics = [CHOICE_LABEL[choice]];
    const result = await scheduleQuickEmail(
      { insert: insertRow },
      {
        studentId,
        parentEmail,
        topics,
        offerScreenshots: false,
        body,
      },
    );
    if (!result.ok) {
      setBusy(false);
      setMessage("The draft could not be scheduled. Please try again.");
      return;
    }
    // The screen folds this into the counts and shows the confirmation.
    onScheduled(topics);
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

        <p className="quick-email-field-label">Template</p>
        <div className="quick-email-options" role="group" aria-label="Template">
          {(["positive", "bookchat"] as Choice[]).map((key) => {
            const on = choice === key;
            return (
              <button
                key={key}
                type="button"
                className={`quick-email-option${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => setChoice(key)}
              >
                {CHOICE_LABEL[key]}
              </button>
            );
          })}
        </div>

        {choice === "positive" ? (
          <>
            <label className="field-label" htmlFor="quick-email-topic">
              Topic (optional)
            </label>
            <input
              id="quick-email-topic"
              className="text-field"
              type="text"
              value={topic}
              placeholder="For example, fractions"
              onChange={(event) => setTopic(event.target.value)}
            />
          </>
        ) : null}

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
