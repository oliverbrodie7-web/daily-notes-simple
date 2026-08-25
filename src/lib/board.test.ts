import { describe, expect, test } from "bun:test";
import {
  BOARD_COLUMNS,
  BOARD_PAGE,
  columnFor,
  NONE_EXPANDED,
  pageColumn,
  splitIntoColumns,
  toggleExpanded,
  type BoardKey,
  type BoardRow,
} from "./board";
import { applyFilter, ROSTER_FILTERS, type FilterKey } from "./rosterFilters";
import { sortRoster } from "./rosterSort";
import type { ContactStatus } from "./p2";

// A roster wide enough that every column has people in it, that some
// columns run past the first page, and that at least one filter empties a
// column completely.
type Row = BoardRow & {
  student: { id: number; student_name: string; parent_name: string | null };
  focus: boolean;
  touchPoints: number;
  goneQuiet: boolean;
  lastContacted: string | null;
  engagement: number;
};

const STATUSES: ContactStatus[] = [
  "none",
  "attempted",
  "sms",
  "p2_complete",
  "email_report",
  "low_risk",
];

function row(id: number, over: Partial<Row> = {}): Row {
  const status = STATUSES[id % STATUSES.length] ?? "none";
  return {
    student: { id, student_name: `Student ${id}`, parent_name: `Parent ${id}` },
    status,
    done: false,
    overdue: false,
    focus: false,
    touchPoints: 0,
    goneQuiet: false,
    lastContacted: null,
    engagement: 0,
    ...over,
  };
}

// 60 students spread across all four states, more than one page in three of
// them.
const ROSTER: Row[] = [
  ...Array.from({ length: 14 }, (_, i) => row(i + 1, { done: true, status: "p2_complete" })),
  ...Array.from({ length: 13 }, (_, i) => row(i + 100, { overdue: true, status: "attempted" })),
  ...Array.from({ length: 18 }, (_, i) => row(i + 200, { status: "none" })),
  ...Array.from({ length: 15 }, (_, i) => row(i + 300, { status: "sms", touchPoints: 2 })),
];

function sizes(rows: Row[]): Record<BoardKey, number> {
  const columns = splitIntoColumns(rows);
  return {
    overdue: columns.overdue.length,
    none: columns.none.length,
    tried: columns.tried.length,
    complete: columns.complete.length,
  };
}

function total(counts: Record<BoardKey, number>): number {
  return counts.overdue + counts.none + counts.tried + counts.complete;
}

describe("which column a student lands in", () => {
  test("done wins over everything, so a finished student is never overdue", () => {
    expect(columnFor({ done: true, overdue: true, status: "none" })).toBe("complete");
    expect(columnFor({ done: true, overdue: false, status: "p2_complete" })).toBe("complete");
  });

  test("past the deadline and not done is overdue, whatever was logged", () => {
    expect(columnFor({ done: false, overdue: true, status: "none" })).toBe("overdue");
    expect(columnFor({ done: false, overdue: true, status: "attempted" })).toBe("overdue");
  });

  test("nothing logged and not overdue is no contact", () => {
    expect(columnFor({ done: false, overdue: false, status: "none" })).toBe("none");
  });

  test("something logged that does not qualify is tried", () => {
    expect(columnFor({ done: false, overdue: false, status: "attempted" })).toBe("tried");
    expect(columnFor({ done: false, overdue: false, status: "sms" })).toBe("tried");
  });

  test("every student lands in exactly one column", () => {
    const columns = splitIntoColumns(ROSTER);
    const seen = new Map<number, BoardKey[]>();
    for (const column of BOARD_COLUMNS) {
      for (const held of columns[column.key]) {
        seen.set(held.student.id, [...(seen.get(held.student.id) ?? []), column.key]);
      }
    }
    expect(seen.size).toBe(ROSTER.length);
    for (const [, keys] of seen) expect(keys).toHaveLength(1);
  });

  test("the sort order the table left the rows in is kept inside a column", () => {
    const sorted = sortRoster(ROSTER, "name", "reversed");
    const columns = splitIntoColumns(sorted);
    for (const column of BOARD_COLUMNS) {
      const names = columns[column.key].map((held) => held.student.student_name);
      const expected = sorted
        .filter((held) => columnFor(held) === column.key)
        .map((held) => held.student.student_name);
      expect(names).toEqual(expected);
    }
  });
});

describe("the counts add up", () => {
  test("unfiltered, the four columns sum to the whole roster", () => {
    expect(total(sizes(ROSTER))).toBe(ROSTER.length);
  });

  test("under every filter, the four columns sum to what the table would show", () => {
    const keys: (FilterKey | null)[] = [null, ...ROSTER_FILTERS.map((filter) => filter.key)];
    for (const key of keys) {
      const table = applyFilter(key, ROSTER);
      expect(total(sizes(table))).toBe(table.length);
    }
  });

  test("a filter thins the columns rather than reordering them", () => {
    const before = sizes(ROSTER);
    const after = sizes(applyFilter("outstanding", ROSTER));
    // Outstanding is everyone not done, so P2 Complete empties and nothing
    // else changes.
    expect(after.complete).toBe(0);
    expect(after.overdue).toBe(before.overdue);
    expect(after.none).toBe(before.none);
    expect(after.tried).toBe(before.tried);
  });

  test("a filter that empties a column leaves the other three alone", () => {
    const before = sizes(ROSTER);
    const after = sizes(applyFilter("complete", ROSTER));
    expect(after.complete).toBe(before.complete);
    expect(after.overdue).toBe(0);
    expect(after.none).toBe(0);
    expect(after.tried).toBe(0);
  });

  test("a search thins the columns and the counts follow", () => {
    const matching = ROSTER.filter((held) => held.student.student_name.includes("Student 2"));
    const counts = sizes(matching);
    expect(total(counts)).toBe(matching.length);
    expect(matching.length).toBeLessThan(ROSTER.length);
  });
});

describe("an empty column", () => {
  test("all four columns exist even when the roster is empty", () => {
    const columns = splitIntoColumns<Row>([]);
    for (const column of BOARD_COLUMNS) expect(columns[column.key]).toEqual([]);
  });

  test("every column has something to say when it is empty", () => {
    for (const column of BOARD_COLUMNS) expect(column.empty.length).toBeGreaterThan(0);
  });

  test("an empty column offers no control to expand", () => {
    expect(pageColumn<Row>([], false).more).toBeNull();
  });
});

describe("show more", () => {
  test("the first page is ten, and the rest are counted", () => {
    const columns = splitIntoColumns(ROSTER);
    const page = pageColumn(columns.none, false);
    expect(BOARD_PAGE).toBe(10);
    expect(page.shown).toHaveLength(10);
    expect(page.hidden).toBe(8);
    expect(page.more).toBe("Show 8 more");
  });

  test("expanding shows the rest in place, in the same order", () => {
    const columns = splitIntoColumns(ROSTER);
    const page = pageColumn(columns.none, true);
    expect(page.shown).toEqual(columns.none);
    expect(page.hidden).toBe(0);
    expect(page.more).toBe("Show fewer");
  });

  test("a column at or under the page size has no control at all", () => {
    const ten = ROSTER.slice(0, 10);
    expect(pageColumn(ten, false).more).toBeNull();
    expect(pageColumn(ten, false).shown).toHaveLength(10);
  });

  test("expanding one column leaves the others paged", () => {
    const columns = splitIntoColumns(ROSTER);
    const opened = pageColumn(columns.none, true);
    const others = pageColumn(columns.tried, false);
    expect(opened.shown).toHaveLength(18);
    expect(others.shown).toHaveLength(10);
    expect(others.more).toBe("Show 5 more");
  });

  test("one is a student, not students", () => {
    const page = pageColumn(ROSTER.slice(0, 11), false);
    expect(page.hidden).toBe(1);
    expect(page.more).toBe("Show 1 more");
  });
});

describe("switching view never changes who is shown", () => {
  test("the board holds the same students as the table, under any filter", () => {
    const keys: (FilterKey | null)[] = [null, ...ROSTER_FILTERS.map((filter) => filter.key)];
    for (const key of keys) {
      const table = applyFilter(key, ROSTER);
      const columns = splitIntoColumns(table);
      const onBoard = BOARD_COLUMNS.flatMap((column) => columns[column.key]).map(
        (held) => held.student.id,
      );
      expect([...onBoard].sort()).toEqual([...table.map((held) => held.student.id)].sort());
    }
  });

  test("the sort a user picked changes neither list", () => {
    const byName = sortRoster(ROSTER, "name", "default");
    const byTouch = sortRoster(ROSTER, "touch", "reversed");
    const idsOf = (rows: Row[]) =>
      BOARD_COLUMNS.flatMap((column) => splitIntoColumns(rows)[column.key])
        .map((held) => held.student.id)
        .sort();
    expect(idsOf(byName)).toEqual(idsOf(byTouch));
  });
});

describe("show more belongs to one column", () => {
  test("nothing starts expanded", () => {
    expect(NONE_EXPANDED).toEqual({
      overdue: false,
      none: false,
      tried: false,
      complete: false,
    });
  });

  test("expanding one column leaves the other three untouched", () => {
    const after = toggleExpanded(NONE_EXPANDED, "none");
    expect(after.none).toBe(true);
    expect(after.overdue).toBe(false);
    expect(after.tried).toBe(false);
    expect(after.complete).toBe(false);
  });

  test("tapping again folds only that column back up", () => {
    const opened = toggleExpanded(toggleExpanded(NONE_EXPANDED, "none"), "complete");
    const closed = toggleExpanded(opened, "none");
    expect(closed.none).toBe(false);
    expect(closed.complete).toBe(true);
  });

  test("the caller's state is never mutated", () => {
    const before = { ...NONE_EXPANDED };
    toggleExpanded(before, "overdue");
    expect(before.overdue).toBe(false);
  });

  test("what each column shows follows only its own flag", () => {
    const columns = splitIntoColumns(ROSTER);
    const state = toggleExpanded(NONE_EXPANDED, "none");
    expect(pageColumn(columns.none, state.none).shown).toHaveLength(18);
    expect(pageColumn(columns.tried, state.tried).shown).toHaveLength(10);
    expect(pageColumn(columns.overdue, state.overdue).shown).toHaveLength(10);
    expect(pageColumn(columns.complete, state.complete).shown).toHaveLength(10);
  });
});
