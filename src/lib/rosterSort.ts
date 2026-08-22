// Sorting the student list.
//
// The reversed order is produced by reversing the default order rather than
// by flipping the comparator, so "reversed" is always the exact opposite of
// what is on screen, ties included. Flipping only the primary key would
// leave tied students in the same relative order, which is not a reversal.
//
// Sorting never decides which students are shown. It reorders whatever the
// filter and the search have already chosen.

export type SortKey = "p2" | "touch" | "last" | "name" | "engagement";
export type SortDirection = "default" | "reversed";

// The four headings that sort. The fourth column holds the row controls and
// has no sort of its own.
export type SortColumn = "student" | "status" | "touch" | "engagement";

export type SortableRow = {
  student: { student_name: string };
  status: string;
  done: boolean;
  overdue: boolean;
  touchPoints: number;
  lastContacted: string | null;
  // The engagement total for this student's parent.
  engagement: number;
};

export type SortOption = {
  key: SortKey;
  // The name shown on the button and in the menu.
  label: string;
  // Which column heading shows the arrow. Last contacted highlights the P2
  // status heading, because the last contact line lives in that column.
  column: SortColumn;
  // The direction a heading tap starts this sort in. For most columns that
  // is the sort's own default. Touch points is the exception: its menu
  // default is fewest first, but tapping a heading should put the highest
  // at the top, the same as every other heading does.
  headingStart: SortDirection;
  // Wording for the two orders, default first.
  orders: readonly [string, string];
};

export const SORT_OPTIONS: readonly SortOption[] = [
  {
    key: "p2",
    label: "P2 status",
    column: "status",
    headingStart: "default",
    orders: ["Needs attention first", "Done first"],
  },
  {
    key: "touch",
    label: "Touch points",
    column: "touch",
    headingStart: "reversed",
    orders: ["Fewest first", "Most first"],
  },
  {
    key: "last",
    label: "Last contacted",
    column: "status",
    headingStart: "default",
    orders: ["Longest ago first", "Most recent first"],
  },
  {
    key: "name",
    label: "Student name",
    column: "student",
    headingStart: "default",
    orders: ["A to Z", "Z to A"],
  },
  {
    key: "engagement",
    label: "Engagement",
    column: "engagement",
    headingStart: "default",
    orders: ["Most engaged first", "Least engaged first"],
  },
];

// What the screen opens on.
export const DEFAULT_SORT_KEY: SortKey = "p2";
export const DEFAULT_SORT_DIRECTION: SortDirection = "default";

export function findSort(key: SortKey): SortOption {
  return SORT_OPTIONS.find((option) => option.key === key) ?? SORT_OPTIONS[0]!;
}

// The sort a heading turns on when the column is not already sorted.
export const COLUMN_SORTS: Record<SortColumn, SortKey> = {
  student: "name",
  status: "p2",
  touch: "touch",
  engagement: "engagement",
};

export type SortState = { key: SortKey; direction: SortDirection };

export function flip(direction: SortDirection): SortDirection {
  return direction === "default" ? "reversed" : "default";
}

// Tapping a heading. An inactive column takes its own sort in the direction
// a heading starts in; the active column reverses whatever is already on
// it, which is why Last contacted reverses rather than jumping to P2 status
// when the P2 status heading is tapped. There are only ever these two
// outcomes, so no sequence of taps can leave the list unsorted.
export function headingTap(column: SortColumn, current: SortState): SortState {
  if (findSort(current.key).column === column) {
    return { key: current.key, direction: flip(current.direction) };
  }
  const key = COLUMN_SORTS[column];
  return { key, direction: findSort(key).headingStart };
}

// Which way the arrow points, from what actually sits at the top of the
// list rather than from the direction's name. Down means the higher or more
// urgent value is at the top.
export function arrowFor(key: SortKey, direction: SortDirection): "down" | "up" {
  return direction === findSort(key).headingStart ? "down" : "up";
}

export function orderLabel(key: SortKey, direction: SortDirection): string {
  const orders = findSort(key).orders;
  return direction === "reversed" ? orders[1] : orders[0];
}

// How much attention a student needs: overdue, then never contacted, then
// any other incomplete state, then complete.
function urgency(row: SortableRow): number {
  if (row.overdue) return 0;
  if (row.status === "none") return 1;
  if (!row.done) return 2;
  return 3;
}

function byName(a: SortableRow, b: SortableRow): number {
  return a.student.student_name.localeCompare(b.student.student_name);
}

// The default direction for each key. Every one falls back to the student
// name so the order can never shift between loads.
function compare(key: SortKey): (a: SortableRow, b: SortableRow) => number {
  if (key === "touch") {
    return (a, b) => a.touchPoints - b.touchPoints || byName(a, b);
  }
  if (key === "last") {
    // No contact at all sorts as the longest ago. An empty string is below
    // every real ISO date, which puts those students at the top by default
    // and at the bottom once reversed.
    return (a, b) => (a.lastContacted ?? "").localeCompare(b.lastContacted ?? "") || byName(a, b);
  }
  if (key === "engagement") {
    // Highest first by default, so the quiet families are not the ones you
    // have to scroll to find.
    return (a, b) => b.engagement - a.engagement || byName(a, b);
  }
  if (key === "name") {
    return byName;
  }
  return (a, b) => urgency(a) - urgency(b) || byName(a, b);
}

export function sortRoster<T extends SortableRow>(
  rows: T[],
  key: SortKey,
  direction: SortDirection,
): T[] {
  const ordered = [...rows].sort(compare(key));
  return direction === "reversed" ? ordered.reverse() : ordered;
}
