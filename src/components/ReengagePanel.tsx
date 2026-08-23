import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import {
  NEEDS_NOTE_NOTE,
  NOTHING_AVAILABLE_NOTE,
  canFill,
  fillAll,
  recommend,
  subjectAndBody,
  type FamilyFacts,
} from "../lib/reengage";
import { SMS_OVER_LIMIT_NOTE, smsCountLabel, smsOverLimit } from "../lib/reengagement";
import type { ReengagementTemplate } from "../lib/reengagement";

type ReengagePanelProps = {
  studentName: string;
  parentName: string | null;
  templates: ReengagementTemplate[];
  detail: string | null;
  facts: FamilyFacts;
  onClose: () => void;
};

const COPIED_FOR_MS = 2000;
const NOTHING_LOADED_NOTE =
  "The re-engagement wording could not be loaded. Close this and try again in a moment.";
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type CopyKey = "subject" | "email" | "sms" | "all";

// Fills the wording in and lets you copy it. It creates no draft, sends no
// email and writes nothing anywhere, which is why there is no save here and
// nothing in the wording says otherwise.
export function ReengagePanel({
  studentName,
  parentName,
  templates,
  detail,
  facts,
  onClose,
}: ReengagePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  // Cheap enough to work out each render, and it must not go stale when the
  // facts behind it change.
  const suggestion = recommend(templates, facts);
  const [selectedId, setSelectedId] = useState<string | null>(
    suggestion ? String(suggestion.template.id) : null,
  );

  const selected =
    templates.find((template) => String(template.id) === selectedId) ??
    suggestion?.template ??
    null;

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

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

  // Only the button that was tapped says Copied.
  async function handleCopy(key: CopyKey, text: string) {
    setCopyFailed(false);
    const worked = await copyText(text);
    if (!worked) {
      setCopyFailed(true);
      return;
    }
    setCopied(key);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_FOR_MS);
  }

  const filled = selected
    ? fillAll(selected, { parentName, studentName, detail })
    : { subject: "", body: "", sms: "" };
  const over = smsOverLimit(filled.sms);
  const anyAvailable = templates.some((template) => canFill(template, Boolean(detail)));
  // Nothing loaded is a different problem from nothing being fillable, and
  // saying it is the note's fault would send you off to write one for nothing.
  const nothingLoaded = templates.length === 0;

  return (
    <div
      className="reengage-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="reengage-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reengage-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="reengage-title" id="reengage-title">
          {studentName}
        </p>
        <p className="reengage-parent">{parentName ?? "No parent name"}</p>

        {nothingLoaded ? (
          <p className="reengage-empty">{NOTHING_LOADED_NOTE}</p>
        ) : anyAvailable ? null : (
          <p className="reengage-empty">{NOTHING_AVAILABLE_NOTE}</p>
        )}

        {nothingLoaded ? null : (
          <ul className="reengage-options">
            {templates.map((template) => {
              const id = String(template.id);
              const available = canFill(template, Boolean(detail));
              const isRecommended = suggestion?.template.id === template.id;
              const isSelected = selected?.id === template.id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`reengage-option${isSelected ? " is-selected" : ""}`}
                    aria-pressed={isSelected}
                    disabled={!available}
                    onClick={() => setSelectedId(id)}
                  >
                    <span className="reengage-option-name">{template.name}</span>
                    {isRecommended && available ? (
                      <span className="reengage-recommended">
                        <span className="reengage-recommended-tag">Recommended</span>
                        <span className="reengage-recommended-why">{suggestion?.why}</span>
                      </span>
                    ) : null}
                    {available ? null : (
                      <span className="reengage-unavailable">{NEEDS_NOTE_NOTE}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected ? (
          <>
            <div className="reengage-block">
              <div className="reengage-block-head">
                <span className="reengage-block-label">Subject</span>
                <button
                  type="button"
                  className="reengage-copy"
                  onClick={() => void handleCopy("subject", filled.subject)}
                >
                  {copied === "subject" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="reengage-subject">{filled.subject}</p>
            </div>

            <div className="reengage-block">
              <div className="reengage-block-head">
                <span className="reengage-block-label">Email</span>
                <button
                  type="button"
                  className="reengage-copy"
                  onClick={() => void handleCopy("email", filled.body)}
                >
                  {copied === "email" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="reengage-body">{filled.body}</p>
            </div>

            <div className="reengage-block">
              <div className="reengage-block-head">
                <span className="reengage-block-label">SMS</span>
                <button
                  type="button"
                  className="reengage-copy"
                  onClick={() => void handleCopy("sms", filled.sms)}
                >
                  {copied === "sms" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="reengage-sms">{filled.sms}</p>
              <p className={`reengage-count${over ? " is-over" : ""}`}>
                {smsCountLabel(filled.sms)}
                {over ? <span className="reengage-count-note">{SMS_OVER_LIMIT_NOTE}</span> : null}
              </p>
            </div>

            {copyFailed ? (
              <p className="reengage-message" role="alert">
                That could not be copied. Select the wording and copy it by hand.
              </p>
            ) : null}

            <button
              type="button"
              className="primary-button reengage-copy-all"
              onClick={() => void handleCopy("all", subjectAndBody(filled))}
            >
              {copied === "all" ? "Copied" : "Copy all"}
            </button>
          </>
        ) : null}

        <div className="reengage-actions">
          <button type="button" className="row-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
