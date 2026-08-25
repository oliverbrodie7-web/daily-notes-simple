// The Board view on the Parents screen.
//
// Four columns, one P2 state each, and every student in exactly one of them.
// Nothing here works a P2 state out for itself: it reads done, overdue and
// the derived status that the table already has, so the board and the table
// can never disagree about where a student stands.
//
// The order the four are tried in matters, because the states overlap. A
// student past the deadline with nothing logged is both overdue and without
// contact, so done is asked first, then overdue, then nothing logged, and
// what is left has been tried. Exhaustive and exclusive, which is what makes
// the four counts add up to the roster.

import type { ContactStatus } from "./p2";

export type BoardKey = "overdue" | "none" | "tried" | "complete";

export type BoardRow = {
  done: boolean;
  overdue: boolean;
  status: ContactStatus;
};

export type BoardColumn = {
  key: BoardKey;
  name: string;
  // The token family the heading, the count and the card edge take.
  tone: "danger" | "neutral" | "warning" | "good";
  // Shown when nobody is in this column. An empty Overdue column is good
  // news, so a column never collapses or disappears.
  empty: string;
};

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    key: "overdue",
    name: "Overdue",
    tone: "danger",
    empty: "Nothing overdue",
  },
  {
    key: "none",
    name: "No contact",
    tone: "neutral",
    empty: "Everybody has been contacted",
  },
  {
    key: "tried",
    name: "Tried",
    tone: "warning",
    empty: "Nothing part way",
  },
  {
    key: "complete",
    name: "P2 Complete",
    tone: "good",
    empty: "Nobody done yet",
  },
] as const;

// How many a column shows before it has to be asked for the rest.
export const BOARD_PAGE = 10;

export function columnFor(row: BoardRow): BoardKey {
  if (row.done) return "complete";
  if (row.overdue) return "overdue";
  if (row.status === "none") return "none";
  return "tried";
}

// Every row placed once. The rows arrive in whatever order the sort and the
// filter left them in, and that order is kept inside each column.
export function splitIntoColumns<T extends BoardRow>(rows: T[]): Record<BoardKey, T[]> {
  const columns: Record<BoardKey, T[]> = { overdue: [], none: [], tried: [], complete: [] };
  for (const row of rows) columns[columnFor(row)].push(row);
  return columns;
}

// What one column shows right now, and what its control has to say.
export type ColumnPage<T> = {
  shown: T[];
  hidden: number;
  // Null when there is nothing to reveal, so no control is drawn at all.
  more: string | null;
};

// Which columns have been asked for the rest of their students.
export type ExpandedColumns = Record<BoardKey, boolean>;

export const NONE_EXPANDED: ExpandedColumns = {
  overdue: false,
  none: false,
  tried: false,
  complete: false,
};

// Show more belongs to one column. This is what keeps it that way: the
// other three come back exactly as they were.
export function toggleExpanded(current: ExpandedColumns, key: BoardKey): ExpandedColumns {
  return { ...current, [key]: !current[key] };
}

export function pageColumn<T>(rows: T[], expanded: boolean, size = BOARD_PAGE): ColumnPage<T> {
  if (expanded || rows.length <= size) {
    return {
      shown: rows,
      hidden: 0,
      more: rows.length > size ? "Show fewer" : null,
    };
  }
  const hidden = rows.length - size;
  return { shown: rows.slice(0, size), hidden, more: `Show ${hidden} more` };
}
