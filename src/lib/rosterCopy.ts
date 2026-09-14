// Copying the students currently on screen.
//
// It is handed the same array the view is rendering, after the tile filter,
// the search and the sort, so the button can never disagree with what is
// displayed. It does not know the roster exists.
//
// A student missing the value a format needs is left out rather than
// printed with an empty slot, because the point of every one of these is to
// paste it somewhere: a blank in a BCC line or a call sheet is worse than a
// shorter list. That is why the button reports what it copied rather than
// what was shown.

export type CopyStudent = {
  student_name: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
};

export type CopyFormat = "names" | "parents" | "emails" | "phones";

export type CopyOption = {
  key: CopyFormat;
  label: string;
  hint: string;
};

// In menu order.
export const COPY_OPTIONS: readonly CopyOption[] = [
  { key: "names", label: "Names", hint: "One line, comma separated" },
  { key: "parents", label: "Names and parents", hint: "One per line" },
  { key: "emails", label: "Parent emails", hint: "Named, for pasting into BCC" },
  { key: "phones", label: "Names and phones", hint: "One per line, for a call sheet" },
] as const;

// What the left half of the split button does on its own.
export const COPY_DEFAULT: CopyFormat = "names";

export type CopyResult = {
  text: string;
  // How many students are actually in it, which is what the button says.
  count: number;
};

function tidy(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// A parent_email field is not always one address. At least one record holds
// two separated by a semicolon, and that whole string pasted into a BCC line
// is not a valid address list. The first is the one that gets written to, so
// the rest are dropped.
function firstAddress(value: string | null | undefined): string {
  return tidy(tidy(value).split(";")[0]);
}

// The characters that end a display name early or split the list around it.
// The comma is the one that bites: unquoted, Aponte Ortiz, Lorely becomes two
// recipients and everything after it lands in the wrong place. The app has no
// say in what is typed into parent_name, so every name is checked.
const NEEDS_QUOTING = /[,.;<>"]/;

function displayName(name: string): string {
  if (!NEEDS_QUOTING.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

// Nicole Donnelly <alvm1316@gmail.com>, so a paste into a To or BCC field
// shows a named recipient rather than a raw address. A genuinely blank parent
// name falls back to the address on its own rather than empty brackets. A
// first name only is still a name and is printed as one.
function emailLine(student: CopyStudent): string {
  const address = firstAddress(student.parent_email);
  const parent = tidy(student.parent_name);
  return parent ? `${displayName(parent)} <${address}>` : address;
}

// The fields each format needs. A student missing any one of them is not in
// that format's list.
//
// Phones is the exception, and deliberately. On a call sheet the number is
// the point, and six parents on the roster carry a first name only, so
// requiring a parent name there would throw away usable numbers. The parent
// name is printed when it is there and left out when it is not. Emails read
// the same way and are gated in has() instead, on the address rather than on
// the field.
const NEEDED: Record<CopyFormat, (keyof CopyStudent)[]> = {
  names: ["student_name"],
  parents: ["student_name", "parent_name"],
  emails: ["parent_email"],
  phones: ["student_name", "parent_phone"],
};

function has(student: CopyStudent, format: CopyFormat): boolean {
  // Emails are gated on the address that will actually be printed rather
  // than on the raw field, so a field holding nothing but a separator counts
  // as no email at all.
  if (format === "emails") return firstAddress(student.parent_email) !== "";
  return NEEDED[format].every((field) => tidy(student[field]) !== "");
}

function lineFor(student: CopyStudent, format: CopyFormat): string {
  const name = tidy(student.student_name);
  const parent = tidy(student.parent_name);
  switch (format) {
    case "names":
      return name;
    case "parents":
      return `${name}, ${parent}`;
    case "emails":
      return emailLine(student);
    case "phones":
      // Built from what is there, so a missing parent name leaves no empty
      // slot and no stray comma.
      return [name, parent, tidy(student.parent_phone)].filter(Boolean).join(", ");
  }
}

// One line each, or one line for the lot. Names and emails are meant to be
// pasted into a single field, the other two into a document.
const ONE_LINE: CopyFormat[] = ["names", "emails"];

export function copyRows(students: CopyStudent[], format: CopyFormat): CopyResult {
  const lines: string[] = [];
  // Siblings share an address, so it goes in once. Compared without case,
  // since the same address is written both ways.
  const seen = new Set<string>();
  for (const student of students) {
    if (!has(student, format)) continue;
    if (format === "emails") {
      // On the address rather than on the line, because the line now carries
      // a parent name and two siblings can put two different names against
      // one address. The first one seen is the one that is printed.
      const key = firstAddress(student.parent_email).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
    }
    lines.push(lineFor(student, format));
  }
  return {
    text: lines.join(ONE_LINE.includes(format) ? ", " : "\n"),
    count: lines.length,
  };
}

// The menu's heading. No number: it is written before a format is chosen,
// so it cannot know that Parent emails will produce 75 where the row says
// 76, and two numbers disagreeing reads as a fault. The button says the
// true one after the click, and that one cannot be wrong.
export const COPY_MENU_TITLE = "Copy the students on screen";

// What the button says after the click.
export function copiedLabel(count: number): string {
  return `${count} copied`;
}

export const COPY_FAILED_LABEL = "Could not copy";
export const COPY_IDLE_LABEL = "Copy names";

// How long the confirmation stands before the button goes back to itself.
export const COPY_REVERT_MS = 2000;

// What the button is saying at any moment. It is the only feedback there
// is: no toast, nothing to dismiss.
export type CopyState = { kind: "idle" } | { kind: "copied"; count: number } | { kind: "failed" };

export const COPY_IDLE: CopyState = { kind: "idle" };

export function copyLabel(state: CopyState): string {
  if (state.kind === "copied") return copiedLabel(state.count);
  if (state.kind === "failed") return COPY_FAILED_LABEL;
  return COPY_IDLE_LABEL;
}

export type CopyDeps = {
  copy: (text: string) => Promise<boolean>;
};

// Build the text, hand it over, and say what happened. A clipboard that
// refuses rejects rather than returning, so this never assumes the promise
// resolves.
export async function runCopy(
  deps: CopyDeps,
  students: CopyStudent[],
  format: CopyFormat,
): Promise<CopyState> {
  const { text, count } = copyRows(students, format);
  try {
    const done = await deps.copy(text);
    return done ? { kind: "copied", count } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
