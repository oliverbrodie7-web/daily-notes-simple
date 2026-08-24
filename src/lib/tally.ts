// The touch point tally strip on the Today screen.
//
// Two different questions sit in this one strip, and keeping them apart is
// the point of it. The three numbers count notes written: today, this week
// and this term. The bar underneath counts students reached at least once
// this term, which is the goal, one touch point per student. Somebody can
// write ninety six notes and still have reached only sixty of the roster,
// and the strip has to show both without either being mistaken for the
// other.
//
// One rule runs through all of it: a note only counts once a draft was
// created for it. A note held back with no draft never reached a parent, so
// it is counted nowhere here. That is the same rule the Parents screen
// counts touch points by, and it lives in matchTouchPoints for the bar.

import { mondayOf } from "./focus";
import { p2Rate } from "./p2";
import { matchTouchPoints, type MatchableStudent, type TouchPointNote } from "./touchPoints";

export type TallyNote = {
  note_date: string | null;
  draft_created: boolean | null;
};

export type TouchTally = {
  today: number;
  week: number;
  term: number;
};

export type ReachedTally = {
  reached: number;
  total: number;
  rate: number;
};

// Hidden when the read failed, because a wrong number is worse than no
// number. Loading when it has not arrived yet, which the strip shows as a
// dash rather than a zero so a slow read is never mistaken for a bad day.
export type TallyView =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "ready"; tally: TouchTally; reached: ReachedTally };

// The whole rule, in one place, so nothing in this module can quietly count
// a note that never reached a parent.
export function hasDraft(note: TallyNote): boolean {
  return note.draft_created === true;
}

// Notes written, not students. The array is already scoped to the term by
// the read, so every drafted note in it counts towards the term.
export function tallyNotes(notes: TallyNote[], today: string): TouchTally {
  const weekStart = mondayOf(today);
  let todayCount = 0;
  let week = 0;
  let term = 0;
  for (const note of notes) {
    if (!hasDraft(note)) continue;
    term += 1;
    const date = (note.note_date ?? "").slice(0, 10);
    if (!date) continue;
    // Monday onwards, in Sydney time, because the date handed in is already
    // the Sydney date.
    if (weekStart && date >= weekStart) week += 1;
    if (date === today) todayCount += 1;
  }
  return { today: todayCount, week, term };
}

// The percentage and the count come out of here together, so the bar and
// the wording beside it can never disagree. The rounding is the same
// function the P2 bar uses, so the two bars in this app never round a
// percentage differently.
export function studentsReached(reached: number, total: number): ReachedTally {
  const safeTotal = Math.max(0, total);
  const safeReached = Math.max(0, Math.min(reached, safeTotal));
  return { reached: safeReached, total: safeTotal, rate: p2Rate(safeReached, safeTotal) };
}

// A student is reached once any note matched to them this term has a draft.
// Five notes for one student still counts once, which is exactly the
// difference between the bar and the third number above it.
export function reachedCount<T extends MatchableStudent>(
  notes: TouchPointNote[],
  students: T[],
): number {
  return matchTouchPoints(notes, students).size;
}

export function tallyView<T extends MatchableStudent>(input: {
  failed: boolean;
  notes: (TouchPointNote & TallyNote)[] | null;
  students: T[] | null;
  today: string;
}): TallyView {
  if (input.failed) return { kind: "hidden" };
  if (input.notes === null || input.students === null) return { kind: "loading" };
  return {
    kind: "ready",
    tally: tallyNotes(input.notes, input.today),
    reached: studentsReached(reachedCount(input.notes, input.students), input.students.length),
  };
}
