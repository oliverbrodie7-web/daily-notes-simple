// The re-engagement email templates.
//
// The table already holds five rows and the app never adds or removes one.
// Only three columns are ever written: the subject, the email body and the
// SMS. key, name, when_to_use, needs_detail and id belong to whoever set
// the table up and are read only here.

export type ReengagementTemplate = {
  id: number | string;
  key: string;
  name: string;
  when_to_use: string | null;
  needs_detail: boolean | null;
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  sort_order: number | null;
};

// What a card holds while it is being edited.
export type TemplateDraft = {
  email_subject: string;
  email_body: string;
  sms_body: string;
};

// The only columns the app may write. Anything not named here is left
// alone, whatever a caller passes.
export const EDITABLE_FIELDS = ["email_subject", "email_body", "sms_body"] as const;

export const TEMPLATE_COLUMNS =
  "id, key, name, when_to_use, needs_detail, email_subject, email_body, sms_body, sort_order";

export function draftOf(template: ReengagementTemplate): TemplateDraft {
  return {
    email_subject: template.email_subject ?? "",
    email_body: template.email_body ?? "",
    sms_body: template.sms_body ?? "",
  };
}

export function sameDraft(a: TemplateDraft, b: TemplateDraft): boolean {
  return EDITABLE_FIELDS.every((field) => a[field] === b[field]);
}

// Exactly the three editable columns plus the timestamp. Built here rather
// than at the call site so an extra field cannot creep into an update.
export function updatePayload(draft: TemplateDraft, updatedAt: string): Record<string, string> {
  return {
    email_subject: draft.email_subject,
    email_body: draft.email_body,
    sms_body: draft.sms_body,
    updated_at: updatedAt,
  };
}

// The placeholders and what each one is for.
export const PARENT_PLACEHOLDER = "{parent_first_name}";
export const STUDENT_PLACEHOLDER = "{student_name}";
export const DETAIL_PLACEHOLDER = "{detail}";

export const PLACEHOLDER_NOTES: { token: string; note: string }[] = [
  { token: PARENT_PLACEHOLDER, note: "for the parent's first name" },
  { token: STUDENT_PLACEHOLDER, note: "for the student's first name" },
];

export const DETAIL_NOTE = {
  token: DETAIL_PLACEHOLDER,
  note: "for a specific thing that happened, taken from a recent note about that student",
};

// What the preview stands the placeholders in for.
export const PREVIEW_PARENT = "Sarah";
export const PREVIEW_STUDENT = "Charlie";
export const PREVIEW_DETAIL =
  "Charlie sat with a difficult question for a full ten minutes this week rather than giving up, and got there in the end.";

export function fillPreview(text: string): string {
  return text
    .replaceAll(PARENT_PLACEHOLDER, PREVIEW_PARENT)
    .replaceAll(STUDENT_PLACEHOLDER, PREVIEW_STUDENT)
    .replaceAll(DETAIL_PLACEHOLDER, PREVIEW_DETAIL);
}

// One SMS. Past this it sends as two, which is worth saying but never worth
// blocking a save over.
export const SMS_LIMIT = 160;

export function smsOverLimit(text: string): boolean {
  return text.length > SMS_LIMIT;
}

export function smsCountLabel(text: string): string {
  return `${text.length} ${text.length === 1 ? "character" : "characters"}`;
}

export const SMS_OVER_LIMIT_NOTE = "over 160 characters, this will send as two messages";

// A template with no name in it is unusual but might be deliberate, so this
// only ever warns.
export function missingPlaceholders(emailBody: string): string[] {
  const missing: string[] = [];
  if (!emailBody.includes(PARENT_PLACEHOLDER)) missing.push(PARENT_PLACEHOLDER);
  if (!emailBody.includes(STUDENT_PLACEHOLDER)) missing.push(STUDENT_PLACEHOLDER);
  return missing;
}

export function missingPlaceholderWarning(emailBody: string): string | null {
  const missing = missingPlaceholders(emailBody);
  if (missing.length === 0) return null;
  const list = missing.length === 1 ? missing[0] : `${missing[0]} or ${missing[1]}`;
  return `This email does not use ${list}. That may be deliberate, and it will still save.`;
}

// The wording each template shipped with, keyed by its key column.
//
// EMPTY ON PURPOSE. The five rows and their original wording live in the
// database and are not knowable from here, and filling this in with invented
// copy would make Reset destroy the real templates rather than restore them.
// Paste the real originals in and reset will use them. Until then it falls
// back to the wording the screen loaded, which undoes this session's edits
// and can never lose anything that was already saved.
export const ORIGINAL_TEMPLATES: Record<string, TemplateDraft> = {};

export type ResetSource = "original" | "loaded";

export function resetTarget(
  key: string,
  asLoaded: TemplateDraft,
): { draft: TemplateDraft; source: ResetSource } {
  const original = ORIGINAL_TEMPLATES[key];
  return original ? { draft: original, source: "original" } : { draft: asLoaded, source: "loaded" };
}

export function resetQuestion(name: string, source: ResetSource): string {
  return source === "original"
    ? `Put ${name} back to its original wording? Anything you have changed will be lost.`
    : `Put ${name} back to the wording it had when this screen opened? Anything you have changed since will be lost.`;
}
