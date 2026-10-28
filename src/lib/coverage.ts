// The coverage meter on the Parents screen: exactly one group per student
// for the current term, the question being what you can still do about them.
//
//   green  "Has a P2"            a parent has booked a feedback meeting this
//                                term, which is a FULL P2 contact_log row.
//                                That is the parent's doing, not a touch
//                                point you sent.
//   teal   "Touch point sent"    you reached them some other way: any touch
//                                point (a drafted daily_notes note or a quick
//                                email), or any contact_log method this term
//                                that is not a FULL P2 and not a Low Risk
//                                Parent attempt.
//   red    "Needs a touch point" neither. A Low Risk Parent log on its own is
//                                an attempt, not a touch point, so it stays
//                                red.
//
// Green is deliberately NOT isP2Done. A Full Email Report completes a P2 in
// the status badge, but here it is a touch point you sent, not a booking, so
// it is teal. The one thing that makes a student green is a parent booked
// FULL P2.

export type CoverageGroup = "green" | "teal" | "red";

// The one method that makes a student green, and the one that never counts
// as contact. Compared lowercased, the way deriveStatus and the agents do.
const FULL_P2 = "full p2";
const LOW_RISK = "low risk parent";

function methodKey(method: string | null | undefined): string {
  return (method ?? "").trim().toLowerCase();
}

export type CoverageLog = {
  method: string | null;
  date_contacted: string | null;
  logged_at: string | null;
};

// A contact_log row belongs to the term when its contact date, or its logged
// time when there is no contact date, is on or after the window start. No
// upper bound, the same way the touch point and email reads are scoped.
export function logInTerm(log: CoverageLog, windowStart: string): boolean {
  const day = (log.date_contacted ?? log.logged_at ?? "").slice(0, 10);
  return day !== "" && day >= windowStart;
}

export type CoverageSignals = {
  // A FULL P2 contact_log row this term.
  hasFullP2: boolean;
  // A contact_log row this term with a method that is not FULL P2 and not
  // Low Risk Parent. A row with no method at all is not counted as contact.
  hasOtherContact: boolean;
};

export const NO_COVERAGE_SIGNALS: CoverageSignals = { hasFullP2: false, hasOtherContact: false };

// The one decision. touchPoints is the shared count, which already includes
// any quick email, so the meter and the table column cannot disagree.
export function coverageGroup(signals: CoverageSignals, touchPoints: number): CoverageGroup {
  if (signals.hasFullP2) return "green";
  if (touchPoints > 0 || signals.hasOtherContact) return "teal";
  return "red";
}

// One pass over a student's term logs, for the two signals coverage reads.
export function coverageSignals(logsThisTerm: CoverageLog[]): CoverageSignals {
  let hasFullP2 = false;
  let hasOtherContact = false;
  for (const log of logsThisTerm) {
    const method = methodKey(log.method);
    if (method === FULL_P2) hasFullP2 = true;
    else if (method && method !== LOW_RISK) hasOtherContact = true;
  }
  return { hasFullP2, hasOtherContact };
}

// From all of a student's logs, any date, plus the term window and the shared
// touch point count, in one call.
export function coverageFor(
  logs: CoverageLog[],
  windowStart: string,
  touchPoints: number,
): CoverageGroup {
  const thisTerm = logs.filter((log) => logInTerm(log, windowStart));
  return coverageGroup(coverageSignals(thisTerm), touchPoints);
}

// The signals for every student, from the whole contact_log and the window,
// in one pass. Keyed by student id as a string, the way the roster matches.
export function coverageSignalsByStudent(
  logs: (CoverageLog & { student_id: number | string })[],
  windowStart: string,
): Map<string, CoverageSignals> {
  const map = new Map<string, CoverageSignals>();
  for (const log of logs) {
    if (!logInTerm(log, windowStart)) continue;
    const id = String(log.student_id);
    const entry = map.get(id) ?? { hasFullP2: false, hasOtherContact: false };
    const method = methodKey(log.method);
    if (method === FULL_P2) entry.hasFullP2 = true;
    else if (method && method !== LOW_RISK) entry.hasOtherContact = true;
    map.set(id, entry);
  }
  return map;
}

export type CoverageCounts = { green: number; teal: number; red: number; total: number };

// The three group counts always sum to the number of students handed in,
// because every student is in exactly one group.
export function coverageCounts(groups: CoverageGroup[]): CoverageCounts {
  const counts: CoverageCounts = { green: 0, teal: 0, red: 0, total: groups.length };
  for (const group of groups) counts[group] += 1;
  return counts;
}

// The meter wording, kept here so the component and the tests read one copy.
export const COVERAGE_HEADLINE_LABEL = "families need a touch point";
export const COVERAGE_CAPTION = "What you control this term";

// The headline once there is nobody left to contact.
export const COVERAGE_FINISH = "Every family has had contact";

// The pace line under the headline. With weeks still to go: how many are
// left, how long is left, and the rate that implies. With none left, the
// term having ended or no term set, just how many to go and no pace. Per
// week is red spread evenly over the weeks left, rounded.
export function coveragePaceLine(red: number, weeksLeft: number): string {
  if (weeksLeft <= 0) return `${red} to go`;
  const perWeek = Math.round(red / weeksLeft);
  return `${red} to go, ${weeksLeft} teaching weeks left, about ${perWeek} a week`;
}

export type CoverageLegendItem = { group: CoverageGroup; label: string; note: string };

// In bar order: green, then teal, then red.
export const COVERAGE_LEGEND: readonly CoverageLegendItem[] = [
  { group: "green", label: "Has a P2", note: "parent booked" },
  { group: "teal", label: "Touch point sent", note: "you caught them" },
  { group: "red", label: "Needs a touch point", note: "your job" },
];
