// The touch point tally strip on the Today screen.
//
// Two different questions sit in this one strip. The three counters count
// notes written: today, this week and this term. The bar underneath counts
// students reached at least once this term, which is the goal, one touch
// point per student. Somebody can write ninety six notes and have reached
// only sixty of the roster, so the strip shows both.
//
// The two halves answer to different rules, and keeping them apart is the
// point of it.
//
// The three counters count notes WRITTEN. A note counts the moment it is
// saved, draft or no draft, because a tutor writing all afternoon has to see
// the number climb as they work. Drafts are created by the nightly job at
// 7:30pm, so gating the counters on them left the today number reading zero
// for the entire working day and only filling in after everyone had gone
// home. That was my specification and it was wrong.
//
// The bar counts students REACHED, and reached means a parent actually
// received something, so it keeps the draft rule exactly as it was. It runs
// through matchTouchPoints, which owns that rule.
//
// So three notes written this afternoon move all three counters at once and
// move the bar not at all until tonight. That is correct, and neither half
// may be made to answer to the other's rule.

import { mondayOf } from "./focus";
import { p2Rate } from "./p2";
import { matchTouchPoints, type MatchableStudent, type TouchPointNote } from "./touchPoints";

// The date is all the counters read. Whether a draft exists is the bar's
// business, and keeping it out of this type is what stops the two rules
// being confused for one another again.
export type TallyNote = {
  note_date: string | null;
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

// Notes written, not students, and not drafts. The array is already scoped
// to the term by the read, so every note in it counts towards the term.
//
// Nothing here can go down as notes are added: each note only ever adds to
// the counters it falls inside, and the boundaries come from the one date
// handed in rather than from the clock, so they cannot move part way through.
export function tallyNotes(notes: TallyNote[], today: string): TouchTally {
  // The one helper, shared with the suggestion strip. Sydney time, because
  // the date handed in is already the Sydney date.
  const weekStart = mondayOf(today);
  let todayCount = 0;
  let week = 0;
  let term = 0;
  for (const note of notes) {
    term += 1;
    const date = (note.note_date ?? "").slice(0, 10);
    if (!date) continue;
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
// Five notes for one student still counts once, and a note written today
// counts not at all until the job has drafted it. Both of those are exactly
// what separates the bar from the third counter above it.
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
