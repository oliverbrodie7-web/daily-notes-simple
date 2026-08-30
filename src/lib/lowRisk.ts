// One tap logging of a low risk parent.
//
// The vocabulary is not invented here. It is the pair from CONTACT_METHODS
// and OUTCOMES_BY_METHOD that deriveStatus reads as done, quoted from p2.ts
// so the one tap write and the full panel cannot drift apart.
//
// The pair matters more than either half. deriveStatus returns "low_risk"
// only for "low risk parent" with the outcome "noted", and "attempted" for
// that method with anything else, so a write that carried the method alone
// would quietly record the family as tried rather than reached.

import type { ContactMethod, ContactStatus } from "./p2";

// Written out rather than indexed out of CONTACT_METHODS, so reordering
// that list cannot quietly change what one tap writes. The ContactMethod
// annotation is the tie back: rename the method in p2.ts and this stops
// compiling. The pairing with the outcome is pinned by a test against
// OUTCOMES_BY_METHOD, because a wrong outcome fails silently rather than
// loudly.
export const LOW_RISK_METHOD: ContactMethod = "Low Risk Parent";
export const LOW_RISK_OUTCOME = "Noted";

// The same columns both existing writers ask for, so the row handed back
// is the shape the roster already holds.
export const LOW_RISK_SELECT = "id, student_id, method, outcome, logged_at, date_contacted";

export const LOW_RISK_FAILED = "The low risk contact could not be saved. Please try again.";

// Shown on the disabled main button. deriveStatus reads only the newest
// qualifying entry, so a low risk row over a completed P2 does not add to
// it, it replaces what the row says.
export const LOW_RISK_BLOCKED_TITLE =
  "Already P2 Complete. A low risk entry would replace that on the row, so use the arrow instead.";

export type LowRiskEntry = {
  student_id: number | string;
  date_contacted: string;
  method: string;
  outcome: string;
  logged_at: string;
};

export type SavedLowRiskLog = {
  id: number | string;
  student_id: number | string;
  method: string | null;
  outcome: string | null;
  logged_at: string | null;
  date_contacted: string | null;
};

// today is a Sydney date, from sydneyTodayIso. loggedAt is a full
// timestamp. They are different clocks on purpose: date_contacted is the
// day the contact happened where the centre is, and logged_at is the
// instant the row was written, which the roster query orders by.
export function lowRiskEntry(
  studentId: number | string,
  today: string,
  loggedAt: string,
): LowRiskEntry {
  return {
    student_id: studentId,
    date_contacted: today,
    method: LOW_RISK_METHOD,
    outcome: LOW_RISK_OUTCOME,
    logged_at: loggedAt,
  };
}

// The one place the main button's disabled rule lives, so the button and
// its explanation can never disagree about when it applies.
export function lowRiskBlocked(status: ContactStatus): boolean {
  return status === "p2_complete";
}

// The arrow opens the full panel and writes nothing, so nothing blocks it.
// A student whose P2 is already complete still needs a way to log.
export function arrowBlocked(): boolean {
  return false;
}

export type RowError = { studentId: string; text: string } | null;

// The message belongs to one row. Every other row asks and is told
// nothing, which is what stops one row's failure appearing under another.
export function rowErrorFor(error: RowError, studentId: number | string): string | null {
  if (!error) return null;
  return error.studentId === String(studentId) ? error.text : null;
}

export type LowRiskDeps = {
  // Read when the tap arrives rather than captured, so the second of two
  // fast taps sees the first one's flag rather than the render before it.
  busyId: () => string | null;
  setBusyId: (id: string | null) => void;
  save: (entry: LowRiskEntry) => Promise<{ data: SavedLowRiskLog | null; error: unknown }>;
  // The roster's existing handler. There is no second path into state.
  onSaved: (log: SavedLowRiskLog) => void;
  setError: (error: RowError) => void;
  today: () => string;
  now: () => string;
};

export async function logLowRisk(deps: LowRiskDeps, studentId: number | string): Promise<void> {
  const key = String(studentId);
  if (deps.busyId()) return;
  deps.setBusyId(key);
  deps.setError(null);
  try {
    const { data, error } = await deps.save(lowRiskEntry(studentId, deps.today(), deps.now()));
    if (error || !data) {
      deps.setError({ studentId: key, text: LOW_RISK_FAILED });
      return;
    }
    deps.onSaved(data);
  } catch {
    // A thrown request and a returned error read the same to the user.
    deps.setError({ studentId: key, text: LOW_RISK_FAILED });
  } finally {
    // Always, so a failure never leaves the button dead.
    deps.setBusyId(null);
  }
}
