import { UNDO_SUFFIX } from "../lib/undoToast";
import { CloseIcon, TickIcon } from "./Icons";

// The strip itself, and nothing else. It holds no state, reads no clock and
// talks to no database: the screen owns all of that, because the screen is
// where the state has to live to survive a roster reload.

type UndoToastProps = {
  studentName: string;
  // Set when an undo failed, so the strip says so and stays put.
  failure: string | null;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  // The countdown pauses while the strip is under a pointer or holds
  // keyboard focus, so it cannot expire out from under someone reading it.
  onPause: () => void;
  onResume: () => void;
};

export function UndoToast({
  studentName,
  failure,
  busy,
  onUndo,
  onDismiss,
  onPause,
  onResume,
}: UndoToastProps) {
  return (
    <div
      className="undo-toast"
      // Announced where it is. Focus is never moved here: taking it would
      // pull the user off the row they were working through.
      role="status"
      aria-live="polite"
      onPointerEnter={onPause}
      onPointerLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      <span className="undo-toast-tick" aria-hidden="true">
        <TickIcon size={13} />
      </span>
      <p className="undo-toast-text">
        <span className="undo-toast-name">{studentName}</span>
        <span className="undo-toast-said">{UNDO_SUFFIX}</span>
      </p>
      {failure ? <p className="undo-toast-failure">{failure}</p> : null}
      <button
        type="button"
        className="undo-toast-button"
        disabled={busy}
        aria-label={`Undo low risk for ${studentName}`}
        onClick={onUndo}
      >
        {busy ? "Undoing..." : "Undo"}
      </button>
      {/* Not rendered on a phone, where the strip is full width and the
          countdown is the way out. */}
      <button
        type="button"
        className="undo-toast-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={onDismiss}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
