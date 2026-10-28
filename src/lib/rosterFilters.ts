// The stat tiles and the filtered list read from one definition each, so a
// tile's number and the number of students its filter shows are the same
// calculation and can never drift apart.
//
// Only the counting rule lives here. Deciding whether a student is done,
// overdue, in the focus, or has a touch point happens upstream: this module
// reads the flags that were already worked out for the row badges, so the
// tiles can never disagree with the rows either.

import type { CoverageGroup } from "./coverage";

export type FilterableRow = {
  done: boolean;
  overdue: boolean;
  focus: boolean;
  touchPoints: number;
  // Silent for three weeks or more, having emailed at least once this term.
  goneQuiet: boolean;
  // The one coverage group this student is in for the term.
  coverage: CoverageGroup;
};

export type FilterKey =
  | "complete"
  | "outstanding"
  | "overdue"
  | "focus"
  | "no-touch"
  | "quiet"
  | "green"
  | "teal"
  | "red";

// Which soft tint the tile and the filter bar take when it is active.
export type FilterTone = "accent" | "warning";

export type RosterFilter = {
  key: FilterKey;
  // The tile wording, the bar wording, and the line shown when the filter
  // matches nobody.
  tile: string;
  showing: string;
  empty: string;
  tone: FilterTone;
  matches: (row: FilterableRow) => boolean;
};

// In tile order. P2 Rate is not here: a percentage is not a list of
// students, so it never filters and is not a button.
export const ROSTER_FILTERS: readonly RosterFilter[] = [
  {
    key: "complete",
    tile: "P2 Complete",
    showing: "Showing students whose P2 is complete",
    empty: "Nothing to show. No student has completed their P2 this term.",
    tone: "accent",
    matches: (row) => row.done,
  },
  {
    key: "outstanding",
    tile: "P2 Outstanding",
    showing: "Showing students whose P2 is not complete",
    empty: "Nothing to show. Every student has completed their P2 this term.",
    tone: "accent",
    matches: (row) => !row.done,
  },
  {
    key: "overdue",
    tile: "P2 Overdue",
    showing: "Showing students who are overdue",
    empty: "Nothing to show. No student is overdue.",
    tone: "accent",
    matches: (row) => row.overdue,
  },
  {
    key: "focus",
    tile: "Focus this week",
    showing: "Showing students in the focus for this week",
    empty: "Nothing to show. No student is in the focus for this week.",
    tone: "accent",
    matches: (row) => row.focus,
  },
  {
    key: "no-touch",
    tile: "No touch point",
    showing: "Showing students with no touch point",
    empty: "Nothing to show. Every student has been contacted this term.",
    tone: "warning",
    matches: (row) => row.touchPoints === 0,
  },
  {
    key: "quiet",
    tile: "Gone quiet",
    showing: "Showing parents who have gone quiet",
    empty: "Nothing to show. No parent has gone quiet this term.",
    tone: "warning",
    matches: (row) => row.goneQuiet,
  },
];

// The coverage meter's three groups, which filter the list the same way a
// tile does. Kept apart from ROSTER_FILTERS, which still feeds the P2 bar, so
// each list stays its own thing; findFilter and the counts read both.
export const COVERAGE_FILTERS: readonly RosterFilter[] = [
  {
    key: "green",
    tile: "Has a P2",
    showing: "Showing families with a booked P2",
    empty: "Nothing to show. No family has booked a P2 this term.",
    tone: "accent",
    matches: (row) => row.coverage === "green",
  },
  {
    key: "teal",
    tile: "Touch point sent",
    showing: "Showing families you have reached this term",
    empty: "Nothing to show. No family has had a touch point yet.",
    tone: "accent",
    matches: (row) => row.coverage === "teal",
  },
  {
    key: "red",
    tile: "Needs a touch point",
    showing: "Showing families who still need a touch point",
    empty: "Nothing to show. Every family has had a touch point this term.",
    tone: "warning",
    matches: (row) => row.coverage === "red",
  },
];

// Every filter the screen can turn on: the P2 tiles and the coverage groups.
export const ALL_FILTERS: readonly RosterFilter[] = [...ROSTER_FILTERS, ...COVERAGE_FILTERS];

export function findFilter(key: FilterKey | null): RosterFilter | null {
  if (!key) return null;
  return ALL_FILTERS.find((filter) => filter.key === key) ?? null;
}

// The one calculation behind both a tile's number and its filtered list.
export function applyFilter<T extends FilterableRow>(key: FilterKey | null, rows: T[]): T[] {
  const filter = findFilter(key);
  return filter ? rows.filter(filter.matches) : rows;
}

export function countFor(key: FilterKey, rows: FilterableRow[]): number {
  return applyFilter(key, rows).length;
}

// Tapping the active tile clears it, tapping another swaps to it. Only one
// filter is ever on.
export function toggleFilter(current: FilterKey | null, tapped: FilterKey): FilterKey | null {
  return current === tapped ? null : tapped;
}

// A count for a tile. Zero reads as a single character: "00" looks like a
// rendering fault rather than a number, while a padded "07" is deliberate.
export function tileCount(value: number): string {
  return value === 0 ? "0" : String(value).padStart(2, "0");
}
