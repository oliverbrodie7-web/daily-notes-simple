// Reading a Word document that holds several students, one note each.
//
// Reading is anchored on student names, not on counting lines. A line that
// names somebody on the roster starts a new entry, and everything after it
// belongs to that student until the next name. Line counts stop mattering,
// so a stray year level on one student and not another no longer stops the
// whole document.
//
// Tables and paragraphs are no longer two different documents. Both flatten
// to one ordered list of lines and run through the same rules, so a document
// holding a table with headings around it is read whole.
//
// Nothing is dropped without saying so. Lines that anchor on nobody are
// handed back as unrecognised blocks, and every line thrown away inside an
// entry is recorded on that entry. The panel shows both.
//
// The input is mammoth's HTML rather than its plain text. Its plain text
// throws away the soft line breaks inside a cell, so a whole student runs
// together into one unreadable line. The HTML keeps the table, the cells and
// every break, and it has to be asked to keep empty paragraphs.
//
// Nothing here touches the network or the database. It takes what the
// document gave up and returns what would be saved, and the panel does the
// saving only when a person presses the button.

import { matchNote, normaliseStudentName, type MatchableStudent } from "./touchPoints";

export type BulkStudent = {
  // Exactly as the document wrote it.
  name: string;
  topic: string;
  note: string;
  // The two joined, which is what a saved note carries.
  noteText: string;
  // Every line thrown away for this student, so the panel can show what was
  // left out rather than leaving a person to trust that nothing was.
  ignored: string[];
  // Which line of the flattened document the name sat on. Enough for a card
  // to point back at it.
  at: number;
};

// Lines that anchored on nobody. They are shown as a card with no name
// rather than discarded, so a student the roster does not know about is
// visible instead of silently missing.
export type UnrecognisedBlock = {
  lines: string[];
  at: number;
};

// Which of the two shapes was being read, so a refusal can name a cell or a
// line rather than always saying line.
export type BulkWhere = "line" | "cell";

export type BulkParseResult =
  | { ok: true; students: BulkStudent[]; unrecognised: UnrecognisedBlock[] }
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
  "Each student needs their name on a line of its own, with their topic and note on the lines after it.";

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

function refuse(reason: string, text = "", at = 1): BulkParseResult {
  return { ok: false, students: [], where: "line", at, text, reason };
}

export const ROSTER_MISSING =
  "The student list has not loaded yet. Close this and try again in a moment.";

export const NO_ANCHORS =
  "No student names were found. Each student needs their name on its own line.";

export const NO_TEXT = "There is no text in this document.";

// One ordered list of lines for the whole document: every table cell's
// lines first, in document order, then every line outside a table. Blanks
// are gone, because a blank line no longer means anything now that the
// names are what separate one student from the next.
export function flattenDocument(shape: DocumentShape): string[] {
  const lines: string[] = [];
  for (const cell of shape.cells) lines.push(...cellLines(cell));
  for (const line of shape.lines) {
    const trimmed = line.trim();
    if (trimmed !== "") lines.push(trimmed);
  }
  return lines;
}

// A line long enough to be a sentence is not a name, and neither is one
// that ends the way a sentence ends. Both guards come before the roster is
// asked, because a note can easily contain somebody's name.
const NAME_MAX = 40;

export function couldBeName(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.length > NAME_MAX) return false;
  return !/[.?!]$/.test(trimmed);
}

// Ambiguous anchors just as firmly as matched. A line that fits four
// students is still plainly a name; it only needs the picker afterwards.
export function isAnchor<T extends MatchableStudent>(line: string, roster: T[]): boolean {
  if (!couldBeName(line)) return false;
  const found = matchNote({ student_name: line }, roster);
  return found.kind === "matched" || found.kind === "ambiguous";
}

const DIGITS_ONLY = /^\d+$/;

// A line that is only a number is a year level or a lesson count. It is
// recorded rather than used, so nothing disappears without being shown.
export function isIgnorable(line: string): boolean {
  return DIGITS_ONLY.test(line.trim());
}

// The topic is the first line carrying a greater than sign, but never the
// last line left: a note can legitimately contain one, as in "she saw that
// 12 > 8", and the last line is always the note. Failing that, a short
// opening line with no full stop in it reads as a heading.
const TOPIC_MAX = 60;

export function pickTopic(lines: string[]): number {
  // The last line is always the note, so nothing before that point can be
  // the whole of what a student has. That holds for the fallback below as
  // much as for the sign: a student whose only line is "Fractions" has a
  // note reading Fractions, not a topic and no note at all.
  if (lines.length < 2) return -1;
  for (let index = 0; index < lines.length - 1; index += 1) {
    if ((lines[index] ?? "").includes(">")) return index;
  }
  const first = lines[0];
  if (first !== undefined && first.length <= TOPIC_MAX && !first.includes(".")) return 0;
  return -1;
}

// One student's lines, the name already taken off the front.
export function buildStudent(name: string, body: string[], at: number): BulkStudent {
  const ignored: string[] = [];
  const kept: string[] = [];
  for (const line of body) {
    if (isIgnorable(line)) ignored.push(line);
    else kept.push(line);
  }
  const topicAt = pickTopic(kept);
  const topic = topicAt < 0 ? "" : (kept[topicAt] ?? "");
  const note = kept.filter((_, index) => index !== topicAt).join(" ");
  return { name, topic, note, noteText: noteTextFrom(topic, note), ignored, at };
}

// What stripTutorInitials took off the end, worked out by asking it rather
// than by repeating its rule, so the two can never disagree about what was
// removed.
export function strippedInitials(note: string): string {
  const kept = stripTutorInitials(note);
  if (kept === note) return "";
  return note.trimEnd().slice(kept.trimEnd().length).trim();
}

// The note as it will read once saved, without the topic in front of it.
export function noteBody(note: string): string {
  return stripTutorInitials(note).trim();
}

export function parseBulkDocument<T extends MatchableStudent>(
  html: string,
  roster: T[],
): BulkParseResult {
  // Asked first, and never worked around. An empty roster would anchor on
  // nothing and report a perfectly good document as entirely unrecognised,
  // which looks exactly like a broken file.
  if (roster.length === 0) return refuse(ROSTER_MISSING);

  const lines = flattenDocument(readDocument(html ?? ""));
  if (lines.length === 0) return refuse(NO_TEXT);

  const anchors: number[] = [];
  lines.forEach((line, index) => {
    if (isAnchor(line, roster)) anchors.push(index);
  });
  if (anchors.length === 0) return refuse(NO_ANCHORS, lines[0] ?? "");

  const students: BulkStudent[] = [];
  const unrecognised: UnrecognisedBlock[] = [];

  // Anything before the first name belongs to nobody. It is handed back
  // rather than dropped.
  const firstAnchor = anchors[0] ?? 0;
  if (firstAnchor > 0) {
    unrecognised.push({ lines: lines.slice(0, firstAnchor), at: 1 });
  }

  anchors.forEach((anchor, position) => {
    const next = anchors[position + 1] ?? lines.length;
    students.push(buildStudent(lines[anchor] ?? "", lines.slice(anchor + 1, next), anchor + 1));
  });

  return { ok: true, students, unrecognised };
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
  // A block that anchored on nobody. It has no name of its own, so it
  // cannot be saved until a person says whose it is.
  unrecognised: boolean;
};

// An unrecognised block wearing a student's clothes, so one list and one
// card can show both. It has no name and no topic: every line it holds is
// note, shown exactly as the document wrote it.
function blockAsStudent(block: UnrecognisedBlock): BulkStudent {
  const note = block.lines.join(" ");
  return { name: "", topic: "", note, noteText: note, ignored: [], at: block.at };
}

export function toCards(
  students: BulkStudent[],
  unrecognised: UnrecognisedBlock[],
  existingKeys: Set<string>,
): BulkCard[] {
  const named: BulkCard[] = students.map((student, index) => ({
    key: `s${index}-${student.at}`,
    student,
    studentId: null,
    skipped: false,
    alreadyAdded: existingKeys.has(noteKey(student.name, student.noteText)),
    includeAnyway: false,
    unrecognised: false,
  }));
  const loose: BulkCard[] = unrecognised.map((block, index) => ({
    key: `u${index}-${block.at}`,
    student: blockAsStudent(block),
    studentId: null,
    skipped: false,
    // Nothing to compare: a block with no name cannot be the same note as
    // one already on today's list.
    alreadyAdded: false,
    includeAnyway: false,
    unrecognised: true,
  }));
  // In document order, which puts a block that came before the first name
  // where it was written.
  return [...named, ...loose].sort((a, b) => a.student.at - b.student.at);
}

// In the batch means not skipped, not already on today's list unless a
// person asked for it anyway, and not a nameless block waiting for somebody
// to say whose it is. This one predicate decides both the number on the
// button and what is actually inserted, so the two cannot drift.
export function inBatch(card: BulkCard): boolean {
  if (card.skipped) return false;
  if (card.unrecognised && !card.studentId) return false;
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
