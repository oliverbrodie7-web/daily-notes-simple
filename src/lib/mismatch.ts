// Ranking likely students for an unmatched Calendly booking. Nothing here
// ever decides a match on its own: it only orders candidates so the right
// one is usually the first tap. A wrong attribution writes a completed P2
// against the wrong student, so confirmation always stays with the person.

export type CalendlyMismatch = {
  id: number | string;
  invitee_name: string | null;
  student_name_given: string | null;
  event_start_time: string | null;
  reviewed: boolean | null;
};

export type RankableStudent = {
  id: number | string;
  student_name: string;
  parent_name: string | null;
};

export type RankedStudent<T> = {
  student: T;
  score: number;
};

// Trim, lowercase, collapse whitespace, and treat punctuation as a space so
// "O'Brien" and "O Brien" compare equal.
export function normaliseName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0;
  const longest = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / longest;
}

// The whole string, and the best single token pair. A parent who typed only
// a first name should still surface the right student, and a one letter slip
// inside a first name should barely cost anything.
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  let best = ratio(left, right);
  const leftTokens = left.split(" ");
  const rightTokens = right.split(" ");
  for (const leftToken of leftTokens) {
    for (const rightToken of rightTokens) {
      if (leftToken.length < 2 || rightToken.length < 2) continue;
      // A token match is strong evidence but slightly weaker than the whole
      // name matching, so it is discounted a little.
      best = Math.max(best, ratio(leftToken, rightToken) * 0.95);
    }
  }
  return best;
}

// The typed student name is the main signal. The invitee is the parent, so
// it is compared against the parent name too, and parents sometimes type a
// parent name into the student field, which the cross comparisons catch.
export function scoreStudent(
  mismatch: Pick<CalendlyMismatch, "invitee_name" | "student_name_given">,
  student: RankableStudent,
): number {
  const given = mismatch.student_name_given;
  const invitee = mismatch.invitee_name;
  return Math.max(
    similarity(given, student.student_name),
    similarity(given, student.parent_name) * 0.9,
    similarity(invitee, student.parent_name) * 0.85,
    similarity(invitee, student.student_name) * 0.8,
  );
}

// Candidates worth offering as a one tap option. Anything weaker is left to
// the search box rather than dressed up as a suggestion. Measured against
// the roster: genuine matches score 0.79 and above, while the strongest
// false positive seen was 0.42, so this floor sits in the gap with room on
// both sides. Offering a plausible wrong option is the expensive mistake
// here, so it is set to exclude rather than to include.
export const SUGGESTION_FLOOR = 0.6;

export function rankStudents<T extends RankableStudent>(
  mismatch: Pick<CalendlyMismatch, "invitee_name" | "student_name_given">,
  students: T[],
  limit = 3,
): RankedStudent<T>[] {
  return students
    .map((student) => ({ student, score: scoreStudent(mismatch, student) }))
    .filter((entry) => entry.score >= SUGGESTION_FLOOR)
    .sort(
      (a, b) =>
        b.score - a.score || a.student.student_name.localeCompare(b.student.student_name),
    )
    .slice(0, limit);
}

// The search fallback: plain substring matching on either name, so anything
// the ranking missed is still reachable.
export function searchStudents<T extends RankableStudent>(query: string, students: T[]): T[] {
  const needle = normaliseName(query);
  if (!needle) return [];
  return students.filter(
    (student) =>
      normaliseName(student.student_name).includes(needle) ||
      normaliseName(student.parent_name).includes(needle),
  );
}
