// Engagement, built from emails parents send in.
//
// The app only ever reads parent_emails. A weekly job fills it and owns
// every column; nothing here writes to it.
//
// The score only goes up. It never decays and never drops, so a parent who
// was in touch early in the term keeps the credit for it.

export type ParentEmail = {
  parent_email: string | null;
  received_at: string | null;
  subject: string | null;
  is_touch_point_reply: boolean | null;
};

export type EngagementLevel = "very" | "engaged" | "warm" | "cooling" | "cold" | "none";

export type ScoredEmail = {
  receivedAt: string;
  subject: string | null;
  // A reply the parent was led into is worth a third, not nothing: it is
  // still contact, just contact you started.
  weight: number;
};

export type Engagement = {
  // The total weight inside the term, from week 3 onwards.
  score: number;
  level: EngagementLevel;
  // Every counting email, newest first.
  emails: ScoredEmail[];
  // Days since the most recent email of any kind, week 3 rule ignored, so
  // this always reflects reality. Null when there is none at all.
  daysSinceLast: number | null;
  // Touch point replies in the term, counted whatever the score did with
  // them. The week 3 rule is about scoring engagement, not about whether a
  // parent replied, so the touch points cell counts every one.
  replies: number;
};

// A reply to an email you sent about their child. The parent was led into
// it, so it counts for a third of an email they started themselves.
export const REPLY_WEIGHT = 1 / 3;
export const FULL_WEIGHT = 1;

// The first fortnight is timetable season and would flatter every family
// equally, so nothing before week 3 counts towards the score.
export const COUNTING_STARTS_DAY = 14;

// How long without an email before it is worth saying so.
export const QUIET_DAYS = 21;
export const VERY_QUIET_DAYS = 35;

export const LEVEL_LABELS: Record<EngagementLevel, string> = {
  very: "Very engaged",
  engaged: "Engaged",
  warm: "Warm",
  cooling: "Cooling",
  cold: "Cold",
  none: "Nothing",
};

// How many of the five segments are filled at each level.
export const LEVEL_SEGMENTS: Record<EngagementLevel, number> = {
  very: 5,
  engaged: 4,
  warm: 3,
  cooling: 2,
  cold: 1,
  none: 0,
};

export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function levelFor(score: number): EngagementLevel {
  if (score >= 6) return "very";
  if (score >= 3) return "engaged";
  if (score >= 1.5) return "warm";
  if (score >= 0.5) return "cooling";
  if (score > 0) return "cold";
  return "none";
}

export function weightOf(email: Pick<ParentEmail, "is_touch_point_reply">): number {
  return email.is_touch_point_reply === true ? REPLY_WEIGHT : FULL_WEIGHT;
}

// Whole days between two instants, floored, so "today" is 0 and yesterday
// is 1 however many hours ago that was.
function daysBetweenInstants(from: string, to: Date): number | null {
  const then = Date.parse(from);
  if (Number.isNaN(then)) return null;
  return Math.floor((to.getTime() - then) / 86_400_000);
}

// The date the score starts counting from: fourteen days after the term
// began, which is the start of week 3.
export function countingStart(termStartIso: string | null | undefined): string | null {
  if (!termStartIso) return null;
  const start = Date.parse(`${termStartIso}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  return new Date(start + COUNTING_STARTS_DAY * 86_400_000).toISOString().slice(0, 10);
}

// True while today is still inside the first fortnight, when the column
// says it is counting from week 3 rather than showing a score.
export function beforeCounting(termStartIso: string | null | undefined, todayIso: string): boolean {
  const from = countingStart(termStartIso);
  if (!from || !todayIso) return false;
  return todayIso < from;
}

type BuildOptions = {
  termStart: string | null | undefined;
  termEnd: string | null | undefined;
  now: Date;
};

// One pass over the term's emails, grouped by the parent's address.
// Siblings share an address, so they share a row here and show identical
// figures, which is intended.
export function engagementByEmail(
  rows: ParentEmail[],
  { termStart, termEnd, now }: BuildOptions,
): Map<string, Engagement> {
  const from = countingStart(termStart);
  const byEmail = new Map<string, Engagement>();

  for (const row of rows) {
    const key = normaliseEmail(row.parent_email);
    if (!key || !row.received_at) continue;
    const day = row.received_at.slice(0, 10);
    // Outside the term entirely: not this term's business at all.
    if (termStart && day < termStart) continue;
    if (termEnd && day > termEnd) continue;

    const entry = byEmail.get(key) ?? {
      score: 0,
      level: "none" as EngagementLevel,
      emails: [],
      daysSinceLast: null,
      replies: 0,
    };

    // The last email line ignores the week 3 rule, so it always reflects
    // reality even while nothing is counting yet.
    const days = daysBetweenInstants(row.received_at, now);
    if (days !== null && (entry.daysSinceLast === null || days < entry.daysSinceLast)) {
      entry.daysSinceLast = days;
    }
    if (row.is_touch_point_reply === true) entry.replies += 1;

    if (!from || day >= from) {
      const weight = weightOf(row);
      entry.score += weight;
      entry.emails.push({ receivedAt: row.received_at, subject: row.subject, weight });
    }
    byEmail.set(key, entry);
  }

  for (const entry of byEmail.values()) {
    entry.level = levelFor(entry.score);
    entry.emails.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
  return byEmail;
}

export const EMPTY_ENGAGEMENT: Engagement = {
  score: 0,
  level: "none",
  emails: [],
  daysSinceLast: null,
  replies: 0,
};

export function engagementFor(
  parentEmail: string | null | undefined,
  byEmail: Map<string, Engagement>,
): Engagement {
  const key = normaliseEmail(parentEmail);
  if (!key) return EMPTY_ENGAGEMENT;
  return byEmail.get(key) ?? EMPTY_ENGAGEMENT;
}

// Plain wording for how long it has been.
export function lastEmailLine(daysSinceLast: number | null): string {
  if (daysSinceLast === null) return "Never emailed";
  if (daysSinceLast <= 0) return "Emailed today";
  if (daysSinceLast === 1) return "Emailed 1 day ago";
  if (daysSinceLast < 7) return `Emailed ${daysSinceLast} days ago`;
  const weeks = Math.floor(daysSinceLast / 7);
  return `Last email ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
}

export type QuietTone = "faint" | "warning" | "danger";

// Never emailed stays faint: there is no silence to measure against.
export function lastEmailTone(daysSinceLast: number | null): QuietTone {
  if (daysSinceLast === null) return "faint";
  if (daysSinceLast >= VERY_QUIET_DAYS) return "danger";
  if (daysSinceLast >= QUIET_DAYS) return "warning";
  return "faint";
}

// Going quiet requires having spoken first, so a parent who has never
// emailed is never counted.
export function hasGoneQuiet(engagement: Engagement): boolean {
  // daysSinceLast sees every email in the term, including the first
  // fortnight's, which is what "emailed at least once this term" means.
  if (engagement.daysSinceLast === null) return false;
  return engagement.daysSinceLast >= QUIET_DAYS;
}

// The sentence at the foot of the panel.
export function engagementSummary(engagement: Engagement): string {
  const { score, emails, daysSinceLast } = engagement;
  // Nothing at all in the term, rather than nothing that counted.
  if (daysSinceLast === null) return "This parent has not emailed us this term.";
  if (daysSinceLast !== null && daysSinceLast >= VERY_QUIET_DAYS) {
    const weeks = Math.floor(daysSinceLast / 7);
    return `Has not been in touch for ${weeks} weeks.`;
  }
  if (daysSinceLast !== null && daysSinceLast >= QUIET_DAYS) {
    const weeks = Math.floor(daysSinceLast / 7);
    return `Quiet for ${weeks} weeks after being in touch earlier in the term.`;
  }
  if (emails.length === 0) return "Only in touch during the first fortnight.";
  const led = emails.filter((email) => email.weight < FULL_WEIGHT).length;
  const started = emails.length - led;
  if (score >= 6) return "In touch most weeks, and usually starts the conversation.";
  if (score >= 3) {
    return started > led
      ? "In touch regularly, mostly starting the conversation."
      : "In touch regularly, mostly replying to emails you sent.";
  }
  if (score >= 1.5) return "In touch now and then, mostly about practical things.";
  return started > 0 ? "Barely in touch this term." : "Only ever replies, never starts.";
}
