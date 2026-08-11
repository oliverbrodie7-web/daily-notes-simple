// Message templates and the export list. The rule that matters here is
// FIRST NAMES ONLY: nothing built in this file may carry a surname, and the
// export may never carry an email address.

export type MessageTemplate = {
  id: number | string;
  template_name: string | null;
  subject?: string | null;
  body: string | null;
};

export function firstName(full: string | null | undefined): string {
  const value = (full ?? "").trim();
  if (!value) return "";
  return value.split(/\s+/)[0] ?? "";
}

// The greeting falls back to "there" the way the old tracker did, so a
// missing parent name never renders an empty gap in a message.
export function greetingName(full: string | null | undefined): string {
  return firstName(full) || "there";
}

export function populateTemplate(
  text: string | null | undefined,
  parentFirst: string,
  studentFirst: string,
): string {
  return (text ?? "")
    .replace(/\{\{\s*parent_name\s*\}\}/gi, parentFirst)
    .replace(/\{\{\s*student_name\s*\}\}/gi, studentFirst);
}

export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/\s+/g, "")}?body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${email.trim()}?${query}`;
}

// The BCC export. "First <email>;" is what Gmail and Outlook parse when it
// is pasted into a BCC field, so the angle brackets and the semicolon are
// load bearing. Deduplicated by email address, which is what collapses
// siblings onto one parent, and sorted by first name.
export function parentEmailPairs(
  people: { parent_name?: string | null; parent_email?: string | null }[],
): string[] {
  const byEmail = new Map<string, { first: string; email: string }>();
  for (const person of people) {
    const email = (person.parent_email ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (byEmail.has(key)) continue;
    byEmail.set(key, { first: firstName(person.parent_name), email });
  }
  return [...byEmail.values()]
    .sort((a, b) => a.first.localeCompare(b.first))
    .map((entry) => `${entry.first} <${entry.email}>;`);
}

// One entry per parent even when siblings share them, matched the same way
// the weekly focus matches names, and reduced to first names only.
export function parentFirstNames(names: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of names) {
    const full = (raw ?? "").trim();
    if (!full) continue;
    const key = full.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const first = firstName(full);
    if (first) output.push(first);
  }
  return output;
}
