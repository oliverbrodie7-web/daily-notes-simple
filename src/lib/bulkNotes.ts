// Reading a Word document that holds several students, one note each.
//
// The documents come in two shapes and both are read here.
//
// A table document is a one column table with one student per cell, and the
// lines inside a cell are soft line breaks rather than separate paragraphs.
// A paragraph document is three lines per student with a blank line between
// one student and the next.
//
// When there is a table the table is what counts and any loose paragraphs
// around it are ignored, because that is where the students are.
//
// Either way the reader is strict. A reader that skips lines looking for a
// pattern is how a student is silently missed, which is the whole reason
// this exists, so anything that is not one of those two shapes is refused
// with the line, or the cell, that stopped it.
//
// The input is mammoth's HTML rather than its plain text. Its plain text
// throws away the soft line breaks inside a cell, so a whole student runs
// together into one unreadable line. The HTML keeps the table, the cells and
// every break, and it has to be asked to keep empty paragraphs, which is
// what separates one student from the next in a paragraph document.
//
// Nothing here touches the network or the database. It takes what the
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
  // Where it came from: the line the name sat on in a paragraph document, or
  // the cell number in a table. Enough for a card to point back at it.
  at: number;
};

// Which of the two shapes was being read, so a refusal can name a cell or a
// line rather than always saying line.
export type BulkWhere = "line" | "cell";

export type BulkParseResult =
  | { ok: true; students: BulkStudent[] }
  | {
      ok: false;
      // Everything read cleanly before it stopped, which can still be added.
      students: BulkStudent[];
      where: BulkWhere;
      at: number;
      text: string;
      reason: string;
    };

export const SHAPE_NOTE =
  "Each student needs three lines, the name, then the topic, then the note, with a blank line before the next one.";

export const CELL_SHAPE_NOTE =
  "Each cell needs at least three lines, the name, then the topic, then the note, with the lines in between making up the topic.";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

// The topics are written with a greater than sign, which mammoth escapes, so
// this is not optional decoration: without it every topic keeps an &gt; in
// the middle of it.
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    const named = ENTITIES[body.toLowerCase()];
    if (named) return named;
    if (!body.startsWith("#")) return whole;
    const code =
      body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
    return String.fromCodePoint(code);
  });
}

// A break, or the end of a block, is a new line. Every other tag is
// formatting and is dropped, because a bold student name is still a student
// name and a document that uses italics is not a different shape.
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h[1-6]|li|div|tr)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  );
}

// Pulls out the contents of every outermost run of one tag, and hands back
// everything that was not inside one. Depth is counted rather than matched
// with a lazy pattern, so a table inside a cell cannot end the outer one
// early and quietly swallow the rest of the document.
function carve(html: string, tag: string): { inside: string[]; outside: string } {
  const marks = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  const inside: string[] = [];
  let outside = "";
  let depth = 0;
  let start = 0;
  let cursor = 0;
  let found = marks.exec(html);
  while (found) {
    if (found[1] === "/") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) {
          inside.push(html.slice(start, found.index));
          cursor = found.index + found[0].length;
        }
      }
    } else {
      if (depth === 0) {
        outside += html.slice(cursor, found.index);
        start = found.index + found[0].length;
      }
      depth += 1;
    }
    found = marks.exec(html);
  }
  outside += html.slice(cursor);
  return { inside, outside };
}

export type DocumentShape = {
  // Every cell of every table, in document order, each still carrying its own
  // line breaks. Empty when the document holds no table.
  cells: string[];
  // Every paragraph outside a table, one entry each, blanks included.
  lines: string[];
};

export function readDocument(html: string): DocumentShape {
  const tables = carve(html ?? "", "table");
  const cells: string[] = [];
  for (const table of tables.inside) {
    for (const cell of carve(table, "t[dh]").inside) cells.push(htmlToText(cell));
  }
  const lines = htmlToText(tables.outside)
    .split("\n")
    .map((line) => line.trim());
  return { cells, lines };
}

// The lines a person actually typed in a cell, with the blank ones dropped.
// A cell often opens or closes with a stray break, and those are spacing
// rather than content.
export function cellLines(cell: string): string[] {
  return cell
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

const ORDINALS = [
  "",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

export function ordinal(count: number): string {
  const word = ORDINALS[count];
  if (word) return word;
  const teens = count % 100;
  if (teens >= 11 && teens <= 13) return `${count}th`;
  const last = count % 10;
  const suffix = last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${count}${suffix}`;
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
    where: "line",
    at: index + 1,
    text: lines[index] ?? "",
    reason,
  };
}

// A table document. Every non empty cell is one student, in document order.
// Inside a cell the first line is the name, the last is the note, and
// whatever sits between them is the topic.
export function parseCells(cells: string[]): BulkParseResult {
  const students: BulkStudent[] = [];
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index] ?? "";
    const lines = cellLines(cell);
    // An empty cell is spacing, not a student, so it is passed over rather
    // than refused. A cell with something in it but not enough is refused.
    if (lines.length === 0) continue;
    if (lines.length < 3) {
      return {
        ok: false,
        students,
        where: "cell",
        at: index + 1,
        text: cell.trim(),
        reason: `It holds only ${lines.length === 1 ? "one line" : "two lines"}, and a student needs three.`,
      };
    }
    const name = lines[0] ?? "";
    const note = lines[lines.length - 1] ?? "";
    const topic = lines.slice(1, -1).join(", ");
    students.push({ name, topic, note, noteText: noteTextFrom(topic, note), at: index + 1 });
  }
  if (students.length === 0) {
    return {
      ok: false,
      students,
      where: "cell",
      at: 1,
      text: "",
      reason: "Every cell in this document is empty.",
    };
  }
  return { ok: true, students };
}

export function parseBulkDocument(html: string): BulkParseResult {
  const { cells, lines } = readDocument(html);
  // A table is where the students are, so loose paragraphs around it are
  // ignored rather than read as a second, different document.
  if (cells.length > 0) return parseCells(cells);
  return parseParagraphs(lines);
}

export function parseParagraphs(lines: string[]): BulkParseResult {
  const first = lines.findIndex((line) => line !== "");
  if (first < 0) {
    return {
      ok: false,
      students: [],
      where: "line",
      at: 1,
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
    students.push({ name, topic, note, noteText: noteTextFrom(topic, note), at: i + 1 });
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
    key: `${index}-${student.at}`,
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
