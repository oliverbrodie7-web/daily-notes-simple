import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/clipboard";
import { supabase } from "../lib/supabase";
import {
  copyResetPrompt,
  loadResetPrompt,
  RESET_PROMPT_EMPTY,
  RESET_PROMPT_FAILED,
  RESET_PROMPT_INTRO,
  RESET_PROMPT_LOADING,
  RESET_PROMPT_TITLE,
  RESET_SETTINGS_ROW_ID,
  type ResetPromptLoad,
  type ResetPromptReader,
} from "../lib/resetPrompt";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// The read is behind this one reader. It selects the single column from the
// single settings row and nothing else: no write, no delete, no other table.
const dbReader: ResetPromptReader = {
  async read() {
    const { data, error } = await supabase
      .from("daily_notes_settings")
      .select("reset_prompt")
      .eq("id", RESET_SETTINGS_ROW_ID)
      .single();
    if (error || !data) return { value: null, error: true };
    return { value: (data.reset_prompt as string | null) ?? null, error: false };
  },
};

// While the one read is in flight, before it has landed on a text, empty or
// failed state.
export type ResetPanelState = ResetPromptLoad | { kind: "loading" };

type ResetPromptBodyProps = {
  state: ResetPanelState;
  copied: boolean;
  onCopy: () => void;
};

// The body, pulled out with no hooks of its own so each of the four states
// can be rendered and read on its own. The saved text sits in a scrollable,
// selectable block; the Copy button is shown only when there is text to copy.
export function ResetPromptBody({ state, copied, onCopy }: ResetPromptBodyProps) {
  if (state.kind === "loading") {
    return <p className="reset-prompt-status">{RESET_PROMPT_LOADING}</p>;
  }
  if (state.kind === "failed") {
    return (
      <p className="reset-prompt-status" role="alert">
        {RESET_PROMPT_FAILED}
      </p>
    );
  }
  if (state.kind === "empty") {
    return <p className="reset-prompt-status reset-prompt-empty">{RESET_PROMPT_EMPTY}</p>;
  }
  return (
    <>
      {/* Selectable by default as a pre, focusable so a long block can be
          scrolled from the keyboard, and the exact saved text, unchanged. */}
      <pre className="help-code reset-prompt-text" tabIndex={0} aria-label={RESET_PROMPT_TITLE}>
        {state.text}
      </pre>
      <button type="button" className="row-button reset-prompt-copy" onClick={onCopy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}

type ResetPromptDialogProps = {
  onClose: () => void;
};

// The saved next term reset instructions, shown so they can be copied.
//
// It is display and copy only. It reads reset_prompt once on open and writes
// nothing, deletes nothing and runs no SQL. The only thing it touches beyond
// that one read is the clipboard, and only when Copy is pressed.
//
// The dialog mechanics are the student picker's, unchanged: the same overlay
// and panel, the same role and aria wiring, focus moving in on open and back
// to the opener on close, Escape bound to the document so it works wherever
// the last click landed, and Tab kept inside.
export function ResetPromptDialog({ onClose }: ResetPromptDialogProps) {
  const [state, setState] = useState<ResetPanelState>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // The one read, made once on open. Cancelled on unmount so a late answer
  // cannot land on a closed panel.
  useEffect(() => {
    let cancelled = false;
    void loadResetPrompt(dbReader).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus moves into the panel on open and returns to whatever opened it on
  // close, without the opener having to pass a ref down. The panel itself
  // takes focus first so its title is announced before the body.
  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Escape is bound to the document rather than the panel, so it still works
  // after a click lands on the heading or a gap rather than on a control.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCopy() {
    if (state.kind !== "text") return;
    const ok = await copyResetPrompt({ copy: copyText }, state.text);
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
        className="match-panel reset-prompt-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-prompt-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="match-panel-title" id="reset-prompt-title">
          {RESET_PROMPT_TITLE}
        </p>
        <p className="match-panel-sub">{RESET_PROMPT_INTRO}</p>

        <ResetPromptBody state={state} copied={copied} onCopy={() => void handleCopy()} />

        <button type="button" className="match-cancel" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
