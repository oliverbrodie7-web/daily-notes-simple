// Matching a typed note to a student.
//
// Tutors type the student name by hand, usually as a bare first name and
// often as a first name with a surname initial like "Charlie S". An exact
// full name is the exception, not the rule, so the matcher works through
// four steps in order, from certain to least certain, and stops at the
// first that resolves.
//
// It never guesses between candidates. A name that could belong to two
// students comes back ambiguous, and a person picks on the Today screen.
//
// Touch points are read from daily_notes at display time. The Parents screen
// writes nothing: they are a parallel track that never reaches contact_log,
// never reaches deriveStatus, and never displaces a status badge. The Today
// screen does write, but only student_id and student_name, and only when a
// person has tapped a candidate.
//
// A note only counts as a touch point once an email draft was actually
// created for it. Notes held back with no draft are not contact and are
// excluded entirely, from both the count and the panel.

import { similarity } from "./mismatch";

export type MatchableStudent = {
  id: number | string;
  student_name: string;
  parent_name?: string | null;
};

export type NoteToMatch = {
  student_id?: string | null;
  student_name: string | null;
};

// Exactly three outcomes, for every note. Ambiguous carries the candidates
// so the picker can offer them without recomputing the rule.
export type NoteMatch<T> =
  { kind: "matched"; student: T } | { kind: "ambiguous"; candidates: T[] } | { kind: "unmatched" };

export type TouchPointNote = {
  student_id: string | null;
  student_name: string | null;
  note_date: string | null;
  note_text: string | null;
  // The nightly job's tidied wording, which is what a re-engagement email
  // quotes. Read only, and never used for counting.
  tidied_text: string | null;
  added_by: string | null;
  draft_created: boolean | null;
};

export type TouchPointEntry = {
  date: string | null;
  text: string | null;
  tidied: string | null;
  addedBy: string | null;
};

export type TouchPointSummary = {
  count: number;
  latestDate: string | null;
  entries: TouchPointEntry[];
};

// Trim, lowercase, and collapse runs of whitespace to a single space. Both
// sides of every comparison below go through this, so case and spacing can
// never decide a match.
export function normaliseStudentName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function tokensOf(name: string | null | undefined): string[] {
  const key = normaliseStudentName(name);
  return key ? key.split(" ") : [];
}

// The last token is the surname and everything before it the given names. A
// one word name is a first name with no surname.
function firstNameOf(student: MatchableStudent): string {
  return tokensOf(student.student_name)[0] ?? "";
}

function givenNamesOf(student: MatchableStudent): string {
  const parts = tokensOf(student.student_name);
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
}

function surnameOf(student: MatchableStudent): string {
  const parts = tokensOf(student.student_name);
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
}

const INITIAL = /^([a-z])\.?$/;

// "Charlie S", "charlie s." and "Mary Jane S" all split. The last token has
// to be a single letter, with or without a full stop, and something has to
// come before it.
function splitInitial(typed: string): { given: string; initial: string } | null {
  const parts = typed ? typed.split(" ") : [];
  if (parts.length < 2) return null;
  const found = INITIAL.exec(parts[parts.length - 1]!);
  if (!found) return null;
  return { given: parts.slice(0, -1).join(" "), initial: found[1]! };
}

function byName<T extends MatchableStudent>(students: T[]): T[] {
  return [...students].sort((a, b) => a.student_name.localeCompare(b.student_name));
}

// The four steps, in order. Only active students should ever be passed in:
// an inactive student is not on this list, so nothing can match them.
export function matchNote<T extends MatchableStudent>(
  note: NoteToMatch,
  students: T[],
): NoteMatch<T> {
  // Step one. A student_id is a decision a person already made, so it beats
  // every rule below and no guessing happens.
  const chosenId = (note.student_id ?? "").trim();
  if (chosenId) {
    const chosen = students.find((student) => String(student.id) === chosenId);
    // An id pointing outside the active roster means that student has since
    // been made inactive. The decision still stands, so the name is NOT then
    // guessed at: there is simply nobody active to count the note against.
    return chosen ? { kind: "matched", student: chosen } : { kind: "unmatched" };
  }

  const typed = normaliseStudentName(note.student_name);
  if (!typed) return { kind: "unmatched" };

  // Step two. The full name, character for character once normalised.
  const exact = students.filter((student) => normaliseStudentName(student.student_name) === typed);
  if (exact.length === 1) return { kind: "matched", student: exact[0]! };
  if (exact.length > 1) return { kind: "ambiguous", candidates: byName(exact) };

  // Step three. A first name and a surname initial. The given names are
  // accepted as well as the first name, so "Mary Jane S" reaches Mary Jane
  // Smith the same way "Charlie S" reaches Charlie Smith.
  const split = splitInitial(typed);
  if (split) {
    const fits = students.filter(
      (student) =>
        surnameOf(student).startsWith(split.initial) &&
        (firstNameOf(student) === split.given || givenNamesOf(student) === split.given),
    );
    if (fits.length === 1) return { kind: "matched", student: fits[0]! };
    if (fits.length > 1) return { kind: "ambiguous", candidates: byName(fits) };
    return { kind: "unmatched" };
  }

  // Step four. A bare first name.
  if (!typed.includes(" ")) {
    const fits = students.filter((student) => firstNameOf(student) === typed);
    if (fits.length === 1) return { kind: "matched", student: fits[0]! };
    if (fits.length > 1) return { kind: "ambiguous", candidates: byName(fits) };
  }

  return { kind: "unmatched" };
}

// The fallback list the picker offers for a note that matched nobody. A
// simple similarity on the first name, because that is the part a tutor
// almost always gets right. There is no floor: something to tap always beats
// an empty panel, and the search box sits underneath for everything else.
export function closestStudents<T extends MatchableStudent>(
  typedName: string | null,
  students: T[],
  limit = 5,
): T[] {
  const typed = normaliseStudentName(typedName).split(" ")[0] ?? "";
  if (!typed) return byName(students).slice(0, limit);
  return [...students]
    .map((student) => ({ student, score: similarity(typed, firstNameOf(student)) }))
    .sort(
      (a, b) => b.score - a.score || a.student.student_name.localeCompare(b.student.student_name),
    )
    .slice(0, limit)
    .map((entry) => entry.student);
}

// The Parents screen aggregation. Only drafted notes count, and only notes
// the matcher resolved outright: ambiguous and unmatched notes are counted
// nowhere.
export function matchTouchPoints<T extends MatchableStudent>(
  notes: TouchPointNote[],
  activeStudents: T[],
): Map<string, TouchPointSummary> {
  const summaries = new Map<string, TouchPointSummary>();
  for (const note of notes) {
    // No draft, no touch point. This is the whole rule.
    if (note.draft_created !== true) continue;
    const match = matchNote(note, activeStudents);
    if (match.kind !== "matched") continue;
    const id = String(match.student.id);
    const summary = summaries.get(id) ?? { count: 0, latestDate: null, entries: [] };
    summary.count += 1;
    summary.entries.push({
      date: note.note_date,
      text: note.note_text,
      tidied: note.tidied_text,
      addedBy: note.added_by,
    });
    if (note.note_date && (!summary.latestDate || note.note_date > summary.latestDate)) {
      summary.latestDate = note.note_date;
    }
    summaries.set(id, summary);
  }

  // The most recent tidied wording, for a re-engagement email to quote.
  // Null when no counting note has one.
  // Newest first, so the panel reads the way the contact history does.
  for (const summary of summaries.values()) {
    summary.entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  return summaries;
}

// How a count of OTHER touch points reads in a sentence. The line this goes
// on sits under a note written today, so a number that included today would
// read as though the student had been contacted before when they had not.
// The word "other" is what carries that, and it has to stay in the wording.
export function otherTouchPointsLine(count: number): string {
  if (count <= 0) return "No other touch points this term";
  return `${count} other touch point${count === 1 ? "" : "s"} this term`;
}

// What a matched note's line says about that student's history, and whether
// there is anything to open. Null when there is nothing to count from,
// either because the read failed or because it has not arrived: the line
// then shows without a count, because a missing count is a small problem
// and a broken list is not.
//
// Every note dated today is left out, not just the one the line is attached
// to. A student written about twice today and never before has still not
// been contacted before, and the line has to say so on both notes.
//
// The panel this opens is unaffected: it is a record of the term and shows
// today's notes as well, which is right, because it is not a count.
export function matchCount(
  summaries: Map<string, TouchPointSummary> | null,
  studentId: string | number,
  today: string,
): { count: number; line: string; canOpen: boolean } | null {
  if (!summaries) return null;
  const entries = summaries.get(String(studentId))?.entries ?? [];
  const count = entries.filter((entry) => (entry.date ?? "").slice(0, 10) !== today).length;
  return { count, line: otherTouchPointsLine(count), canOpen: count > 0 };
}

// The most recent tidied wording among a student's counting notes, which is
// what a re-engagement email quotes. Null when none of them has one.
export function latestTidiedText(summary: TouchPointSummary | undefined): string | null {
  if (!summary) return null;
  for (const entry of summary.entries) {
    const tidied = (entry.tidied ?? "").trim();
    if (tidied) return tidied;
  }
  return null;
}
