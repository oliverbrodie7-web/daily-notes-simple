// The quick touch point email flow.
//
// This screen only ever writes one quick_emails row. It never touches Gmail
// and never writes a daily_notes row: the nightly Apps Script drafts the
// real email later from the row written here. Because the touch point count
// already folds in quick_emails, scheduling one moves the family out of red
// at once.

import { firstName, greetingName } from "./templates";

// The six topics offered when the settings row has none saved.
export const DEFAULT_QUICK_EMAIL_TOPICS: readonly string[] = [
  "Progress this term",
  "Homework routine",
  "Focus in sessions",
  "What to practise at home",
  "Confidence and attitude",
  "Upcoming assessment",
];

// The chips to offer: the saved topics from daily_notes_settings, or the
// defaults when the field is empty, missing, or not a list of words.
export function readQuickEmailTopics(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .map((topic) => (typeof topic === "string" ? topic.trim() : ""))
      .filter((topic) => topic !== "");
    if (cleaned.length > 0) return cleaned;
  }
  return [...DEFAULT_QUICK_EMAIL_TOPICS];
}

// The topics tidied for saving: each trimmed, blank ones dropped, order
// kept. Saving the result is always safe, even when it is empty, because
// the reader above falls back to the defaults when no words are stored.
export function tidyQuickEmailTopics(topics: string[]): string[] {
  return topics.map((topic) => topic.trim()).filter((topic) => topic !== "");
}

// The chosen topics: the selected chips, plus the typed one when there is
// one, without repeating a chip the person also typed.
export function effectiveTopics(selected: string[], custom: string): string[] {
  const out = [...selected];
  const extra = custom.trim();
  if (extra && !out.includes(extra)) out.push(extra);
  return out;
}

// A readable list: "a", "a and b", "a, b and c".
export function joinTopics(topics: string[]): string {
  if (topics.length === 0) return "";
  if (topics.length === 1) return topics[0]!;
  return `${topics.slice(0, -1).join(", ")} and ${topics[topics.length - 1]}`;
}

// The built-in wording, used when the settings row has no template saved.
// {parent} and {child} are the first names; {topics} becomes " with <the
// chosen topics>" when any are picked and nothing when none are.
export const DEFAULT_QUICK_EMAIL_TEMPLATE = [
  "Hi {parent},",
  "I wanted to share a quick update on how {child} is going{topics}.",
  "Any questions, just let me know.",
].join("\n\n");

// Appended as its own paragraph when the screenshots toggle is on.
export const DEFAULT_QUICK_EMAIL_SCREENSHOTS_LINE =
  "I am happy to send through a few screenshots of how it is done now, if that would help at home.";

// The saved template, or the built-in one when the column is empty or missing.
export function effectiveTemplate(raw: unknown): string {
  return typeof raw === "string" && raw.trim() !== "" ? raw : DEFAULT_QUICK_EMAIL_TEMPLATE;
}

// The saved screenshots sentence, or the built-in one when it is empty.
export function effectiveScreenshotsLine(raw: unknown): string {
  return typeof raw === "string" && raw.trim() !== "" ? raw : DEFAULT_QUICK_EMAIL_SCREENSHOTS_LINE;
}

// The template with its placeholders filled. {topics} carries its own leading
// " with " so the sentence reads naturally when topics are chosen and closes
// cleanly when none are.
export function fillQuickEmailTemplate(
  template: string,
  values: { parent: string; child: string; topics: string[] },
): string {
  const topicsText = values.topics.length > 0 ? ` with ${joinTopics(values.topics)}` : "";
  return template
    .replaceAll("{parent}", values.parent)
    .replaceAll("{child}", values.child)
    .replaceAll("{topics}", topicsText);
}

export type DraftParts = {
  parentName: string | null;
  studentName: string | null;
  topics: string[];
  offerScreenshots: boolean;
  // The saved wording, when the panel has it. Empty or missing falls back to
  // the built-in template and screenshots sentence.
  template?: string | null | undefined;
  screenshotsLine?: string | null | undefined;
};

// The assembled draft, in a warm voice. The parent first name is derived the
// way the rest of the app does it, falling back to "there", and the child
// first name the same way. The body comes from the editable template, with
// the screenshots sentence appended when the toggle is on.
export function assembleDraft({
  parentName,
  studentName,
  topics,
  offerScreenshots,
  template,
  screenshotsLine,
}: DraftParts): string {
  const parent = greetingName(parentName);
  const child = firstName(studentName) || (studentName ?? "").trim() || "your child";
  const paras = [fillQuickEmailTemplate(effectiveTemplate(template), { parent, child, topics })];
  if (offerScreenshots) {
    paras.push(effectiveScreenshotsLine(screenshotsLine));
  }
  return paras.join("\n\n");
}

export type QuickEmailRow = {
  student_id: string | number;
  parent_email: string | null;
  topics: string[];
  offer_screenshots: boolean;
  body: string;
};

export type ScheduleArgs = {
  studentId: string | number;
  parentEmail: string | null;
  topics: string[];
  offerScreenshots: boolean;
  body: string;
};

// The one row written. Exactly the five columns, nothing else.
export function quickEmailRow(args: ScheduleArgs): QuickEmailRow {
  return {
    student_id: args.studentId,
    parent_email: args.parentEmail,
    topics: args.topics,
    offer_screenshots: args.offerScreenshots,
    body: args.body,
  };
}

export type ScheduleDeps = {
  insert: (row: QuickEmailRow) => Promise<{ error: unknown }>;
};

// Write the one quick_emails row, behind an injectable insert so the path is
// tested with no network. An insert that rejects is treated as a failure
// rather than being allowed to throw.
export async function scheduleQuickEmail(
  deps: ScheduleDeps,
  args: ScheduleArgs,
): Promise<{ ok: boolean; row: QuickEmailRow }> {
  const row = quickEmailRow(args);
  try {
    const { error } = await deps.insert(row);
    return { ok: !error, row };
  } catch {
    return { ok: false, row };
  }
}

// A scheduled quick email as the roster holds it per student.
export type QuickEmailEntry = { topics: string[]; date: string | null };

// One quick email as the touch point panel lists it. The date is handed in
// already formatted, so this stays free of the date helpers.
export function quickEmailLine(topics: string[], dateDisplay: string): string {
  const list = topics.length > 0 ? topics.join(", ") : "no topics";
  return `Quick email: ${list} ${dateDisplay}`.trim();
}
