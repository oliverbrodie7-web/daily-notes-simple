// The P2 rule, encoded once and used everywhere: badges, stats, sort, and
// export must all agree. A student counts as P2 done only if their MOST
// RECENT contact_log entry is FULL P2 with Reached, or Low Risk Parent with
// Noted. Any newer entry of another kind flips them back. Do not loosen
// this: the old tracker's badge code accepted any Low Risk Parent row as
// done while its stats did not, and that inconsistency stops here.

export type ContactLogEntry = {
  method: string | null;
  outcome: string | null;
};

export type ContactStatus =
  "none" | "p2_complete" | "low_risk" | "attempted" | "sms" | "email" | "report";

export function deriveStatus(latest: ContactLogEntry | undefined | null): ContactStatus {
  if (!latest) return "none";
  const method = (latest.method ?? "").trim().toLowerCase();
  const outcome = (latest.outcome ?? "").trim().toLowerCase();
  if (method === "full p2") {
    // FULL P2 without Reached (Voicemail, No Answer) renders as Attempted.
    return outcome === "reached" ? "p2_complete" : "attempted";
  }
  if (method === "low risk parent") {
    // Strict rule: only Noted counts as done. Anything else was a try.
    return outcome === "noted" ? "low_risk" : "attempted";
  }
  if (method === "sms only") return "sms";
  if (method === "email no report") return "email";
  if (method === "email full report") return "report";
  return "none";
}

export function isP2Done(status: ContactStatus): boolean {
  return status === "p2_complete" || status === "low_risk";
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
