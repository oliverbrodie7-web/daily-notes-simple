// The P2 rule, encoded once and used everywhere: badges, stats, sort, and
// export must all agree. A student counts as P2 done only if their most
// recent QUALIFYING entry is FULL P2 with Reached, Full Email Report with
// any outcome, or Low Risk Parent with Noted. Any newer entry of another
// kind flips them back, with one exception: Touch Point Email is invisible
// to the calculation in both directions. Do not loosen this: the old
// tracker's badge code accepted any Low Risk Parent row as done while its
// stats did not, and that inconsistency stops here.

export type ContactLogEntry = {
  method: string | null;
  outcome: string | null;
};

export type ContactStatus =
  | "none"
  | "p2_complete"
  | "email_report"
  | "low_risk"
  | "attempted"
  | "sms"
  | "light"
  | "touch_email";

export function deriveStatus(latest: ContactLogEntry | undefined | null): ContactStatus {
  if (!latest) return "none";
  const method = (latest.method ?? "").trim().toLowerCase();
  const outcome = (latest.outcome ?? "").trim().toLowerCase();
  if (method === "full p2") {
    // FULL P2 without Reached (Voicemail, No Answer) renders as Attempted.
    return outcome === "reached" ? "p2_complete" : "attempted";
  }
  // Full Email Report completes a P2 on its own, whatever the outcome.
  if (method === "full email report") return "email_report";
  if (method === "low risk parent") {
    // Strict rule: only Noted counts as done. Anything else was a try.
    return outcome === "noted" ? "low_risk" : "attempted";
  }
  if (method === "touch point email") return "touch_email";
  if (method === "sms only") return "sms";
  if (method === "light touch") return "light";
  return "none";
}

export function isP2Done(status: ContactStatus): boolean {
  return status === "p2_complete" || status === "email_report" || status === "low_risk";
}

// The exact vocabulary written to contact_log. The strings matter:
// deriveStatus, the agents, and old Janice all read these values.
export const CONTACT_METHODS = [
  "FULL P2",
  "Full Email Report",
  "Low Risk Parent",
  "Touch Point Email",
  "SMS only",
  "Light touch",
] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number];

// Only two methods ask for an outcome. The rest save an empty outcome
// rather than a placeholder word, so an empty list here means the panel
// hides the outcome control entirely.
export const OUTCOMES_BY_METHOD: Record<ContactMethod, readonly string[]> = {
  "FULL P2": ["Reached", "Voicemail", "No Answer"],
  "Full Email Report": [],
  "Low Risk Parent": ["Noted"],
  "Touch Point Email": [],
  "SMS only": [],
  "Light touch": [],
};

// Methods that are invisible to the P2 calculation in both directions:
// they never complete a P2 and never take a student off the done list.
// Touch Point Email is written automatically every night, so without this
// exception it would wipe every completed P2 in the centre. "Touch Point"
// is the older guard for the notes side and stays deliberately outside
// CONTACT_METHODS.
export const TOUCH_POINT_METHOD = "Touch Point";
export const P2_INVISIBLE_METHODS = [TOUCH_POINT_METHOD, "Touch Point Email"] as const;

export function isTouchPointEntry(entry: { method?: string | null } | null | undefined): boolean {
  const method = (entry?.method ?? "").trim().toLowerCase();
  return P2_INVISIBLE_METHODS.some((invisible) => invisible.toLowerCase() === method);
}

// Rows must arrive sorted by logged_at descending; the first row seen per
// student is their most recent entry.
export function latestPerStudent<T extends { student_id: number | string }>(
  logsNewestFirst: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const log of logsNewestFirst) {
    const key = String(log.student_id);
    if (!map.has(key)) map.set(key, log);
  }
  return map;
}

// The entry a badge derives from: the most recent entry that is not one of
// the invisible methods. This is the guard that keeps a student on P2
// Complete when a nightly Touch Point Email lands after it.
export function latestStatusEntryPerStudent<
  T extends { student_id: number | string; method?: string | null },
>(logsNewestFirst: T[]): Map<string, T> {
  return latestPerStudent(logsNewestFirst.filter((log) => !isTouchPointEntry(log)));
}
