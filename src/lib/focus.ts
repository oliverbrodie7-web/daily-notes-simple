// This week's focus, shared between the Parents screen's tile and the
// suggestion strip on Today.
//
// The parent name matching lives here so both read the same rule. The week
// rule does not: the Parents tile takes the newest week present in the
// table, while the strip insists on the Monday of the current week, because
// a stale list is worse than no list when it is nudging someone to write.

export type FocusRow = {
  parent_name: string | null;
  week_start: string | null;
};

export type SuggestableStudent = {
  id: number | string;
  student_name: string;
  parent_name?: string | null;
};

export const SUGGESTION_LIMIT = 5;

// Trim and lowercase, the rule the Parents screen has always used to match a
// focus row to a student.
export function normaliseParentName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// The Monday of the week containing this date. Dates are compared as ISO
// strings and stepped in whole UTC days, so no timezone can drift the
// answer.
export function mondayOf(dateIso: string): string {
  const time = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(time)) return "";
  // getUTCDay is 0 for Sunday, so Monday is 0 days back and Sunday is 6.
  const back = (new Date(time).getUTCDay() + 6) % 7;
  return new Date(time - back * 86_400_000).toISOString().slice(0, 10);
}

// Only the named week. A list written for an earlier week is ignored
// entirely rather than shown as though it were this week's.
export function focusParentNames(rows: FocusRow[], weekStart: string): Set<string> {
  const names = new Set<string>();
  if (!weekStart) return names;
  for (const row of rows) {
    if (row.week_start !== weekStart) continue;
    const name = normaliseParentName(row.parent_name);
    if (name) names.add(name);
  }
  return names;
}

// First name and a single initial, no full stop. A student with no surname
// recorded keeps their first name alone.
export function shortStudentName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const first = parts[0];
  if (!first) return "";
  if (parts.length === 1) return first;
  const initial = parts[parts.length - 1]?.[0] ?? "";
  return initial ? `${first} ${initial.toUpperCase()}` : first;
}

// The students worth suggesting: in this week's focus, and not already
// written about this term. Sorted by name so the strip does not reshuffle
// between loads.
export function focusSuggestions<T extends SuggestableStudent>(
  students: T[],
  focusRows: FocusRow[],
  touchedStudentIds: Set<string>,
  weekStart: string,
  limit = SUGGESTION_LIMIT,
): T[] {
  const names = focusParentNames(focusRows, weekStart);
  if (names.size === 0) return [];
  return students
    .filter((student) => names.has(normaliseParentName(student.parent_name)))
    .filter((student) => !touchedStudentIds.has(String(student.id)))
    .sort((a, b) => a.student_name.localeCompare(b.student_name))
    .slice(0, Math.max(0, limit));
}
