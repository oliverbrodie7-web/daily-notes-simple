import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import {
  copyRetentionExample,
  RETENTION_HELP_EXAMPLE,
  RETENTION_HELP_EXAMPLE_STEP,
  RETENTION_HELP_INTRO,
  RETENTION_HELP_NOTE,
  RETENTION_HELP_STEPS,
  RETENTION_HELP_TITLE,
} from "../lib/retentionHelp";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type RetentionHelpDialogProps = {
  onClose: () => void;
};

// Read only instructions for the end of term re-enrol analysis.
//
// It reads nothing, writes nothing and works nothing out. The analysis it
// describes happens in Claude, so there is no query here and no supabase
// import: the only thing it touches is the clipboard, and only when the
// Copy button is pressed.
//
// The dialog mechanics are the student picker's, unchanged: the same overlay
// and panel, the same role and aria wiring, focus moving in on open and back
// to the opener on close, Escape bound to the document so it works wherever
// the last click landed, and Tab kept inside. The numbered steps reuse the
// import help panel's step vocabulary, and the Copy button is the Templates
// screen's, with the same label and the same revert.
export function RetentionHelpDialog({ onClose }: RetentionHelpDialogProps) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Focus moves into the panel on open and returns to whatever opened it on
  // close, without the opener having to pass a ref down. The panel itself
  // takes focus first so its title is announced before the steps.
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

  async function handleCopy() {
    const ok = await copyRetentionExample({ copy: copyText });
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1500);
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
        className="match-panel retention-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="retention-help-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="match-panel-title" id="retention-help-title">
          {RETENTION_HELP_TITLE}
        </p>
        <p className="match-panel-sub">{RETENTION_HELP_INTRO}</p>

        {/* A real ordered list, so the count is announced and the numbers
            cannot drift from the order. The visible circle is the import
            help panel's, and is hidden from readers because the list is
            already numbered. role="list" keeps those semantics in Safari,
            which drops them when the markers are turned off. */}
        <ol className="retention-steps" role="list">
          {RETENTION_HELP_STEPS.map((step, index) => (
            <li className="help-step retention-step" key={step.lead}>
              <span className="help-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="help-step-body">
                <p className="help-step-title">{step.lead}</p>
                <p className="help-text">{step.body}</p>
                {index + 1 === RETENTION_HELP_EXAMPLE_STEP ? (
                  <>
                    <pre className="help-code">{RETENTION_HELP_EXAMPLE}</pre>
                    <button
                      type="button"
                      className="row-button retention-copy"
                      onClick={() => void handleCopy()}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <p className="retention-note">{RETENTION_HELP_NOTE}</p>

        <button type="button" className="match-cancel" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
