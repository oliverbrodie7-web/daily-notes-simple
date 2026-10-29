import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import { supabase } from "../lib/supabase";
import {
  assembleLayeredDraft,
  fillLayerLine,
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
  // The three layer banks and the skill list, each already falling back to the
  // built-in wording when the settings column was empty.
  layer1: string[];
  layer2: string[];
  layer3: string[];
  skills: string[];
  onClose: () => void;
  // The chosen skill, handed back as a single item array so the screen can
  // move the family out of red at once and the history line still reads.
  onScheduled: (topics: string[]) => void;
};

// The quick email panel, a modal opened from a table row and from the contact
// first card alike. The user picks one option in each of three layers plus a
// skill and the email assembles itself. On Schedule it writes one quick_emails
// row and does nothing else. The nightly job drafts the real email later.
export function QuickEmailPanel({
  studentId,
  studentName,
  parentName,
  parentEmail,
  layer1,
  layer2,
  layer3,
  skills,
  onClose,
  onScheduled,
}: QuickEmailPanelProps) {
  // The dropdown skill, defaulted to the first in the list, and a typed skill
  // that overrides it when present.
  const [skillChoice, setSkillChoice] = useState(() => skills[0] ?? "");
  const [customSkill, setCustomSkill] = useState("");
  // One chosen line per layer, defaulted to the first option so the preview is
  // complete the moment the panel opens.
  const [layer1Pick, setLayer1Pick] = useState(() => layer1[0] ?? "");
  const [layer2Pick, setLayer2Pick] = useState(() => layer2[0] ?? "");
  const [layer3Pick, setLayer3Pick] = useState(() => layer3[0] ?? "");

  // The effective skill: the typed one when there is one, otherwise the
  // dropdown. This is what fills the [skill] token.
  const skill = customSkill.trim() || skillChoice;

  // Seeded with the opening draft, so the preview is there on the first paint
  // rather than only after the effect runs.
  const [body, setBody] = useState(() =>
    assembleLayeredDraft({
      parentName,
      studentName,
      skill: skills[0] ?? "",
      layer1: layer1[0] ?? "",
      layer2: layer2[0] ?? "",
      layer3: layer3[0] ?? "",
    }),
  );
  // Once the person edits the draft, the choices stop rewriting it under them.
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Keep the preview in step with the choices until the person takes the pen.
  useEffect(() => {
    if (edited) return;
    setBody(
      assembleLayeredDraft({
        parentName,
        studentName,
        skill,
        layer1: layer1Pick,
        layer2: layer2Pick,
        layer3: layer3Pick,
      }),
    );
  }, [skill, layer1Pick, layer2Pick, layer3Pick, edited, parentName, studentName]);

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
    // A single item array holding the chosen skill, kept only so the history
    // line still reads. The email itself is the body text below.
    const topics = skill ? [skill] : [];
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

  // One layer, as a labelled vertical list of single select options. The label
  // on each option is filled the same way the preview is, so what you pick is
  // what you read.
  const renderLayer = (
    label: string,
    options: string[],
    pick: string,
    onPick: (value: string) => void,
  ) => (
    <>
      <p className="quick-email-field-label">{label}</p>
      <div className="quick-email-options" role="group" aria-label={label}>
        {options.map((option) => {
          const on = option === pick;
          return (
            <button
              key={option}
              type="button"
              className={`quick-email-option${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onPick(option)}
            >
              {fillLayerLine(option, parentName, studentName, skill)}
            </button>
          );
        })}
      </div>
    </>
  );

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

        <p className="quick-email-field-label">Skill</p>
        <div className="quick-email-skill">
          <select
            className="text-field"
            aria-label="Skill"
            value={skillChoice}
            onChange={(event) => setSkillChoice(event.target.value)}
          >
            {skills.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            className="text-field"
            type="text"
            value={customSkill}
            placeholder="Or type another skill"
            aria-label="Type a skill not in the list"
            onChange={(event) => setCustomSkill(event.target.value)}
          />
        </div>

        {renderLayer("What happened", layer1, layer1Pick, setLayer1Pick)}
        {renderLayer("Why it matters", layer2, layer2Pick, setLayer2Pick)}
        {renderLayer("The ask", layer3, layer3Pick, setLayer3Pick)}

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
