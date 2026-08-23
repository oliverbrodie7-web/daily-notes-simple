// Reading a Word document that holds several students, one note each.
//
// Every student is exactly three lines: the name, the topic, then the note.
// A blank line separates one student from the next. The reader is strict on
// purpose. A reader that skips lines looking for a pattern is how a student
// is silently missed, which is the whole reason this exists, so anything
// that is not that shape is refused with the line that stopped it.
//
// Nothing here touches the network or the database. It takes the text the
// document gave up and returns what would be saved, and the panel does the
// saving only when a person presses the button.

import { normaliseStudentName } from "./touchPoints";

export type BulkStudent = {
  // Exactly as the document wrote it.
  name: string;
  topic: string;
  note: string;
  // The two joined, which is what a saved note carries.
  noteText: string;
  // Where the name sat in the document, so a card can point back at it.
  line: number;
};

export type BulkParseResult =
  | { ok: true; students: BulkStudent[] }
  | {
      ok: false;
      // Everything read cleanly before it stopped, which can still be added.
      students: BulkStudent[];
      line: number;
      text: string;
      reason: string;
    };

export const SHAPE_NOTE =
  "Each student needs three lines, the name, then the topic, then the note, with a blank line before the next one.";

// What mammoth hands back is one paragraph after another, each followed by a
// blank line of its own, so a paragraph the person left empty arrives as an
// empty entry. Splitting on the pair puts the paragraphs back, which is what
// a person means by a line when they look at the document.
export function toLines(raw: string): string[] {
  return (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n\n")
    .flatMap((part) => part.split("\n"))
    .map((line) => line.trim());
}

// The greater than sign is how the topics are written, and it reads as a
// comma once it is in a sentence. A full stop already on the end would
// double up with the one joining the two halves.
export function topicToWords(topic: string): string {
  return topic
    .replace(/\s*>\s*/g, ", ")
    .replace(/[.\s]+$/, "")
    .trim();
}

// One to three letters, with full stops allowed, and at least one capital.
// The capital is what keeps an ordinary word off the end of a note: "work"
// is the same shape as "Lov" and only the capital tells them apart.
const INITIALS = /^[A-Za-z](?:\.?[A-Za-z]){0,2}\.?$/;

function looksLikeInitials(token: string): boolean {
  return INITIALS.test(token) && token !== token.toLowerCase();
}

// One or two short words at the very end, removed only when the note has
// something else in it. A note that is nothing but initials is left whole
// rather than emptied.
export function stripTutorInitials(note: string): string {
  const trimmed = note.trimEnd();
  const tokens = [...trimmed.matchAll(/\S+/g)];
  if (tokens.length < 2) return note;
  let take = 0;
  while (take < 2 && take < tokens.length) {
    const token = tokens[tokens.length - 1 - take];
    if (!token || !looksLikeInitials(token[0])) break;
    take += 1;
  }
  if (take === 0 || take >= tokens.length) return note;
  const cut = tokens[tokens.length - take]?.index ?? trimmed.length;
  const kept = trimmed.slice(0, cut).replace(/[\s,-]+$/, "");
  return kept ? kept : note;
}

// The topic first, then a full stop and a space, then the note.
export function noteTextFrom(topic: string, note: string): string {
  const opening = topicToWords(topic);
  const body = stripTutorInitials(note).trim();
  if (!opening) return body;
  if (!body) return `${opening}.`;
  return `${opening}. ${body}`;
}

function fail(
  students: BulkStudent[],
  index: number,
  lines: string[],
  reason: string,
): BulkParseResult {
  return {
    ok: false,
    students,
    line: index + 1,
    text: lines[index] ?? "",
    reason,
  };
}

export function parseBulkDocument(raw: string): BulkParseResult {
  const lines = toLines(raw);
  const first = lines.findIndex((line) => line !== "");
  if (first < 0) {
    return {
      ok: false,
      students: [],
      line: 1,
      text: "",
      reason: "There is no text in this document.",
    };
  }
  let last = lines.length - 1;
  while (last > first && lines[last] === "") last -= 1;

  const students: BulkStudent[] = [];
  let i = first;
  while (i <= last) {
    const name = lines[i] ?? "";
    if (!name) {
      return fail(students, i, lines, "Expected a student name here, but this line is blank.");
    }
    // A student cut short by the end of the document points at its own name,
    // because that is the line a person has to go and look at.
    if (i + 2 > last) {
      const only = i + 1 > last ? "one line" : "two lines";
      return fail(students, i, lines, `This student has only ${only}, and the document ends here.`);
    }
    const topic = lines[i + 1] ?? "";
    if (!topic) {
      return fail(students, i + 1, lines, "Expected the topic on this line, under the name.");
    }
    const note = lines[i + 2] ?? "";
    if (!note) {
      return fail(students, i + 2, lines, "Expected the note on this line, under the topic.");
    }
    students.push({ name, topic, note, noteText: noteTextFrom(topic, note), line: i + 1 });
    i += 3;
    if (i > last) break;
    if (lines[i] !== "") {
      return fail(students, i, lines, "Expected a blank line here, before the next student.");
    }
    i += 1;
    if (i <= last && lines[i] === "") {
      return fail(
        students,
        i,
        lines,
        "Expected the next student's name here, but this line is blank.",
      );
    }
  }

  return { ok: true, students };
}

// Trimmed, collapsed and lowercased, so a stray space cannot defeat a
// comparison. The same treatment the name matcher gives a name.
export function squash(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// What makes a note the same note as one already added today.
export function noteKey(name: string | null, noteText: string | null): string {
  return `${squash(name)} ${squash(noteText)}`;
}

const TIMES_WORDS = ["", "once", "twice", "three times", "four times", "five times"];
const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five"];

export function timesWord(count: number): string {
  return TIMES_WORDS[count] ?? `${count} times`;
}

export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function duplicateWarning(name: string, count: number): string {
  const word = countWord(count);
  return `${name} appears ${timesWord(count)} in this document. ${word} notes means ${word.toLowerCase()} parent emails.`;
}

// One card per student in the document, which is the whole batch. Held by
// the panel and nowhere else until a person presses the button.
export type BulkCard = {
  key: string;
  student: BulkStudent;
  // Set only when a person picked one in the picker.
  studentId: string | null;
  skipped: boolean;
  alreadyAdded: boolean;
  // Already added, but a person asked for it anyway.
  includeAnyway: boolean;
};

export function toCards(students: BulkStudent[], existingKeys: Set<string>): BulkCard[] {
  return students.map((student, index) => ({
    key: `${index}-${student.line}`,
    student,
    studentId: null,
    skipped: false,
    alreadyAdded: existingKeys.has(noteKey(student.name, student.noteText)),
    includeAnyway: false,
  }));
}

// In the batch means not skipped, and not already on today's list unless a
// person asked for it anyway. This one predicate decides both the number on
// the button and what is actually inserted, so the two cannot drift.
export function inBatch(card: BulkCard): boolean {
  if (card.skipped) return false;
  return !card.alreadyAdded || card.includeAnyway;
}

export function batchCount(cards: BulkCard[]): number {
  return cards.filter(inBatch).length;
}

// The line index of the first appearance of every name written more than
// once, with the warning to show above it. Neither copy is merged or
// dropped: a person decides.
export function duplicateWarnings(students: { name: string }[]): Map<number, string> {
  const counts = new Map<string, number>();
  for (const student of students) {
    const key = normaliseStudentName(student.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const warnings = new Map<number, string>();
  const seen = new Set<string>();
  students.forEach((student, index) => {
    const key = normaliseStudentName(student.name);
    const count = counts.get(key) ?? 0;
    if (count < 2 || seen.has(key)) return;
    seen.add(key);
    warnings.set(index, duplicateWarning(student.name, count));
  });
  return warnings;
}
