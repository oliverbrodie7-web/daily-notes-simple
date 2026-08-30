// The confirmation strip for a one tap low risk log, and its undo.
//
// It is screen level on purpose. ROSTER_FILTERS keys off row.done, so a
// successful tap moves that student into complete and, with a filter on,
// takes their row off the list the instant it is tapped. A message living
// in the row would go with it.
//
// It is also held apart from the logs array on purpose. The roster
// subscribes to contact_log, so the insert this strip is confirming fires a
// full reload a moment after the strip appears. Anything derived from logs
// would blink out. Nothing here is derived from anything.

export type UndoToast = {
  // The row that was written, which is the row undo deletes.
  logId: string;
  studentName: string;
  at: number;
} | null;

export const UNDO_TOAST_MS = 8000;

export const UNDO_SUFFIX = " marked low risk";

export const UNDO_FAILED = "That could not be undone. Please try again.";

export function toastFromLog(
  log: { id: number | string },
  studentName: string,
  at: number,
): NonNullable<UndoToast> {
  return { logId: String(log.id), studentName, at };
}

// What the countdown should be doing right now.
//
// served is how much of the eight seconds has already run. It is banked
// each time the timer stops, so leaving the strip resumes where hovering
// over it paused rather than starting again. servedFor says which strip
// that bank belongs to, so a replacement starts from nothing.
export type DismissPlan = {
  run: boolean;
  delay: number;
  served: number;
  servedFor: string | null;
};

export function planDismiss(
  toast: UndoToast,
  paused: boolean,
  servedFor: string | null,
  served: number,
  total: number = UNDO_TOAST_MS,
): DismissPlan {
  if (!toast) return { run: false, delay: 0, served: 0, servedFor: null };
  // A different strip than the bank was for, so the bank is not its time.
  const fresh = servedFor !== toast.logId;
  const banked = fresh ? 0 : served;
  if (paused) return { run: false, delay: 0, served: banked, servedFor: toast.logId };
  return {
    run: true,
    delay: Math.max(0, total - banked),
    served: banked,
    servedFor: toast.logId,
  };
}

export type UndoDeps = {
  remove: (logId: string) => Promise<{ error: unknown }>;
  // Takes the entry back out of the roster's own array.
  dropLog: (logId: string) => void;
  clear: () => void;
  setBusy: (busy: boolean) => void;
  setFailure: (text: string | null) => void;
};

export async function runUndo(deps: UndoDeps, logId: string): Promise<void> {
  deps.setBusy(true);
  deps.setFailure(null);
  try {
    const { error } = await deps.remove(logId);
    if (error) {
      // The strip stays, so it can be tried again. Closing it would leave
      // the row logged with no way back to it.
      deps.setFailure(UNDO_FAILED);
      return;
    }
    deps.dropLog(logId);
    deps.clear();
  } catch {
    deps.setFailure(UNDO_FAILED);
  } finally {
    deps.setBusy(false);
  }
}
