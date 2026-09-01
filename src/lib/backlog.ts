// Notes from earlier days that still belong to nobody.
//
// A note whose typed name resolves to nobody is invisible from the day
// after it was written: the Today screen shows only today, and the Output
// screen shows one collated day and offers no way to fix it. So a note that
// slipped through stays slipped through.
//
// The judgement is live. It runs matchNote over the notes already in the
// browser rather than reading no_match, which the nightly job sets and
// nothing ever clears, so a note fixed by hand would go on looking broken
// for ever.

import { matchNote, type MatchableStudent, type NoteMatch } from "./touchPoints";

export type BacklogNote = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  note_date: string | null;
  note_text: string | null;
  created_at?: string | null;
};

export type BacklogRow<T> = {
  note: BacklogNote;
  // Ambiguous or unmatched, never matched. Carried so the picker can be
  // opened with the candidates without working them out again.
  match: NoteMatch<T>;
};

// How much of the note a row shows before it is cut.
export const BACKLOG_TEXT_MAX = 90;

export function shortText(text: string | null): string {
  const tidy = (text ?? "").trim().replace(/\s+/g, " ");
  if (tidy.length <= BACKLOG_TEXT_MAX) return tidy;
  return `${tidy.slice(0, BACKLOG_TEXT_MAX).trimEnd()}...`;
}

// One line for the collapsed strip. Never shown at zero: the caller renders
// nothing at all rather than saying everything is fine.
export function backlogLine(count: number): string {
  return `${count} earlier ${count === 1 ? "note needs" : "notes need"} a student`;
}

export function backlogRows<T extends MatchableStudent>(
  notes: BacklogNote[] | null,
  students: T[] | null,
  today: string,
): BacklogRow<T>[] {
  if (!notes || !students || students.length === 0) return [];
  const rows: BacklogRow<T>[] = [];
  for (const note of notes) {
    // A note somebody has already answered for is settled, whatever its
    // name says.
    if (note.student_id) continue;
    // Today's are on the list above, with their own picker.
    if (note.note_date === today) continue;
    const match = matchNote(
      { student_id: note.student_id, student_name: note.student_name },
      students,
    );
    if (match.kind === "matched") continue;
    rows.push({ note, match });
  }
  // Newest first, by the day it was written and then by the moment it was,
  // so two notes from one day keep their order.
  return rows.sort((a, b) => {
    const day = (b.note.note_date ?? "").localeCompare(a.note.note_date ?? "");
    if (day !== 0) return day;
    return (b.note.created_at ?? "").localeCompare(a.note.created_at ?? "");
  });
}
