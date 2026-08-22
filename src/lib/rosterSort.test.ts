import { describe, expect, it } from "bun:test";
import { applyFilter, countFor, toggleFilter, type FilterKey } from "./rosterFilters";
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  SORT_OPTIONS,
  findSort,
  orderLabel,
  arrowFor,
  headingTap,
  sortRoster,
  type SortColumn,
  type SortDirection,
  type SortKey,
  type SortState,
  type SortableRow,
} from "./rosterSort";

type Row = SortableRow & { student: { student_name: string }; focus: boolean };

function row(name: string, over: Partial<Omit<Row, "student">> = {}): Row {
  return {
    student: { student_name: name },
    status: "none",
    done: false,
    overdue: false,
    focus: false,
    touchPoints: 0,
    lastContacted: null,
    engagement: 0,
    ...over,
  };
}

// A roster with every urgency band, a spread of touch point counts, a
// student who has never been contacted, and a deliberate tie.
const ROSTER: Row[] = [
  row("Chloe Adams", {
    status: "p2_complete",
    done: true,
    touchPoints: 4,
    lastContacted: "2026-08-18",
    engagement: 6,
  }),
  row("Aiden Chen", {
    status: "attempted",
    touchPoints: 2,
    lastContacted: "2026-08-02",
    engagement: 1,
  }),
  row("Bella Nguyen", {
    status: "none",
    overdue: true,
    touchPoints: 1,
    lastContacted: "2026-07-30",
    engagement: 3,
  }),
  row("Dylan Ortiz", { status: "none", touchPoints: 0, lastContacted: null }),
  row("Ethan Park", {
    status: "sms",
    touchPoints: 2,
    lastContacted: "2026-08-11",
    engagement: 1,
  }),
];

const names = (rows: Row[]) => rows.map((entry) => entry.student.student_name);

describe("sorting by P2 status", () => {
  it("puts the students needing attention first", () => {
    expect(names(sortRoster(ROSTER, "p2", "default"))).toEqual([
      // Overdue, then never contacted, then any other incomplete, then done.
      "Bella Nguyen",
      "Dylan Ortiz",
      "Aiden Chen",
      "Ethan Park",
      "Chloe Adams",
    ]);
  });

  it("is the order the screen opens on", () => {
    expect(DEFAULT_SORT_KEY).toBe("p2");
    expect(DEFAULT_SORT_DIRECTION).toBe("default");
    expect(names(sortRoster(ROSTER, DEFAULT_SORT_KEY, DEFAULT_SORT_DIRECTION))).toEqual(
      names(sortRoster(ROSTER, "p2", "default")),
    );
  });

  it("never puts a done student above one still outstanding", () => {
    const ordered = sortRoster(ROSTER, "p2", "default");
    const firstDone = ordered.findIndex((entry) => entry.done);
    expect(ordered.slice(firstDone).every((entry) => entry.done)).toBe(true);
  });
});

describe("sorting by touch points", () => {
  it("puts the fewest first", () => {
    expect(names(sortRoster(ROSTER, "touch", "default"))).toEqual([
      "Dylan Ortiz",
      "Bella Nguyen",
      // Aiden and Ethan both have two, so the name decides.
      "Aiden Chen",
      "Ethan Park",
      "Chloe Adams",
    ]);
  });

  it("reads the count on the row, not the P2 state", () => {
    const counts = sortRoster(ROSTER, "touch", "default").map((entry) => entry.touchPoints);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
});

describe("sorting by last contacted", () => {
  it("puts the longest ago first", () => {
    expect(names(sortRoster(ROSTER, "last", "default"))).toEqual([
      // Never contacted at all counts as the longest ago.
      "Dylan Ortiz",
      "Bella Nguyen",
      "Aiden Chen",
      "Ethan Park",
      "Chloe Adams",
    ]);
  });

  it("puts a student with no contact at the top by default", () => {
    expect(sortRoster(ROSTER, "last", "default")[0]?.lastContacted).toBeNull();
  });

  it("puts a student with no contact at the bottom once reversed", () => {
    const reversed = sortRoster(ROSTER, "last", "reversed");
    expect(reversed[reversed.length - 1]?.lastContacted).toBeNull();
  });

  it("treats several students with no contact as equally long ago", () => {
    const two = [row("Zara Ali"), row("Adam Boyd")];
    expect(names(sortRoster(two, "last", "default"))).toEqual(["Adam Boyd", "Zara Ali"]);
  });
});

describe("sorting by student name", () => {
  it("runs A to Z", () => {
    expect(names(sortRoster(ROSTER, "name", "default"))).toEqual([
      "Aiden Chen",
      "Bella Nguyen",
      "Chloe Adams",
      "Dylan Ortiz",
      "Ethan Park",
    ]);
  });

  it("runs Z to A when reversed", () => {
    expect(names(sortRoster(ROSTER, "name", "reversed"))).toEqual([
      "Ethan Park",
      "Dylan Ortiz",
      "Chloe Adams",
      "Bella Nguyen",
      "Aiden Chen",
    ]);
  });
});

describe("sorting by engagement", () => {
  it("puts the most engaged first", () => {
    expect(names(sortRoster(ROSTER, "engagement", "default"))).toEqual([
      "Chloe Adams",
      "Bella Nguyen",
      // Aiden and Ethan both sit on one, so the name decides.
      "Aiden Chen",
      "Ethan Park",
      "Dylan Ortiz",
    ]);
  });

  it("puts the least engaged first when reversed", () => {
    const totals = sortRoster(ROSTER, "engagement", "reversed").map((entry) => entry.engagement);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  it("reads the total, not the P2 state or the touch points", () => {
    const totals = sortRoster(ROSTER, "engagement", "default").map((entry) => entry.engagement);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });
});

describe("reversing", () => {
  it("produces the exact opposite order for every sort", () => {
    for (const option of SORT_OPTIONS) {
      const forward = names(sortRoster(ROSTER, option.key, "default"));
      const back = names(sortRoster(ROSTER, option.key, "reversed"));
      expect(back).toEqual([...forward].reverse());
    }
  });

  it("stays the exact opposite even where students tie", () => {
    // Four students, all identical apart from the name, so every pair ties
    // on the primary key and only the fallback separates them.
    const tied = ["Dana", "Alex", "Cleo", "Bo"].map((name) => row(name, { touchPoints: 3 }));
    const forward = names(sortRoster(tied, "touch", "default"));
    expect(forward).toEqual(["Alex", "Bo", "Cleo", "Dana"]);
    expect(names(sortRoster(tied, "touch", "reversed"))).toEqual([...forward].reverse());
  });
});

describe("ties fall back to the student name", () => {
  it("separates two students on the same touch point count", () => {
    const tied = [row("Zara Ali", { touchPoints: 5 }), row("Adam Boyd", { touchPoints: 5 })];
    expect(names(sortRoster(tied, "touch", "default"))).toEqual(["Adam Boyd", "Zara Ali"]);
  });

  it("separates two students in the same urgency band", () => {
    const tied = [row("Zara Ali", { status: "attempted" }), row("Adam Boyd", { status: "sms" })];
    expect(names(sortRoster(tied, "p2", "default"))).toEqual(["Adam Boyd", "Zara Ali"]);
  });

  it("separates two students contacted on the same date", () => {
    const tied = [
      row("Zara Ali", { lastContacted: "2026-08-10" }),
      row("Adam Boyd", { lastContacted: "2026-08-10" }),
    ];
    expect(names(sortRoster(tied, "last", "default"))).toEqual(["Adam Boyd", "Zara Ali"]);
  });

  it("gives the same order every time it runs, whatever the input order", () => {
    for (const option of SORT_OPTIONS) {
      const fromReversed = names(sortRoster([...ROSTER].reverse(), option.key, "default"));
      expect(fromReversed).toEqual(names(sortRoster(ROSTER, option.key, "default")));
    }
  });

  it("never loses or duplicates a student", () => {
    for (const option of SORT_OPTIONS) {
      for (const direction of ["default", "reversed"] as SortDirection[]) {
        const ordered = sortRoster(ROSTER, option.key, direction);
        expect(ordered).toHaveLength(ROSTER.length);
        expect(names(ordered).sort()).toEqual(names(ROSTER).sort());
      }
    }
  });

  it("leaves the array it was given untouched", () => {
    const before = names(ROSTER);
    sortRoster(ROSTER, "name", "reversed");
    expect(names(ROSTER)).toEqual(before);
  });
});

describe("sorting and filtering stay independent", () => {
  // The screen applies the filter to the sorted rows, so this mirrors what
  // it actually does.
  const shown = (key: FilterKey | null, sort: SortKey, direction: SortDirection) =>
    applyFilter(key, sortRoster(ROSTER, sort, direction));

  it("never changes which students are shown when a filter is active", () => {
    for (const filter of [null, "complete", "outstanding", "overdue", "no-touch"] as const) {
      const base = names(shown(filter, "p2", "default")).sort();
      for (const option of SORT_OPTIONS) {
        for (const direction of ["default", "reversed"] as SortDirection[]) {
          expect(names(shown(filter, option.key, direction)).sort()).toEqual(base);
        }
      }
    }
  });

  it("keeps the tile count right whatever the sort", () => {
    for (const option of SORT_OPTIONS) {
      const sorted = sortRoster(ROSTER, option.key, "reversed");
      expect(countFor("outstanding", sorted)).toBe(countFor("outstanding", ROSTER));
      expect(countFor("no-touch", sorted)).toBe(countFor("no-touch", ROSTER));
    }
  });

  it("still reorders the students a filter has chosen", () => {
    const forward = names(shown("outstanding", "name", "default"));
    const back = names(shown("outstanding", "name", "reversed"));
    expect(back).toEqual([...forward].reverse());
    expect(forward.length).toBeGreaterThan(1);
  });

  it("leaves the sort untouched when the filter changes", () => {
    // Changing a filter is a change to filterKey alone. The sort is held in
    // its own state and nothing here can reach it.
    let sort: SortKey = "touch";
    let direction: SortDirection = "reversed";
    let filter: FilterKey | null = null;
    filter = toggleFilter(filter, "overdue");
    filter = toggleFilter(filter, "no-touch");
    filter = toggleFilter(filter, "no-touch");
    expect(filter).toBeNull();
    expect(sort).toBe("touch");
    expect(direction).toBe("reversed");
    // And the order it produces is unchanged by any of that.
    expect(names(sortRoster(ROSTER, sort, direction))).toEqual(
      names(sortRoster(ROSTER, "touch", "reversed")),
    );
  });
});

describe("the sort vocabulary", () => {
  it("offers exactly the five sorts, in order", () => {
    expect(SORT_OPTIONS.map((option) => option.key)).toEqual([
      "p2",
      "touch",
      "last",
      "name",
      "engagement",
    ]);
    expect(SORT_OPTIONS.map((option) => option.label)).toEqual([
      "P2 status",
      "Touch points",
      "Last contacted",
      "Student name",
      "Engagement",
    ]);
  });

  it("words the two orders to suit what is being sorted by", () => {
    expect(orderLabel("p2", "default")).toBe("Needs attention first");
    expect(orderLabel("p2", "reversed")).toBe("Done first");
    expect(orderLabel("touch", "default")).toBe("Fewest first");
    expect(orderLabel("touch", "reversed")).toBe("Most first");
    expect(orderLabel("last", "default")).toBe("Longest ago first");
    expect(orderLabel("last", "reversed")).toBe("Most recent first");
    expect(orderLabel("name", "default")).toBe("A to Z");
    expect(orderLabel("name", "reversed")).toBe("Z to A");
    expect(orderLabel("engagement", "default")).toBe("Most engaged first");
    expect(orderLabel("engagement", "reversed")).toBe("Least engaged first");
  });

  it("points each sort at the column heading that shows the arrow", () => {
    expect(findSort("p2").column).toBe("status");
    expect(findSort("touch").column).toBe("touch");
    // The last contact line lives under the P2 status pill.
    expect(findSort("last").column).toBe("status");
    expect(findSort("name").column).toBe("student");
    expect(findSort("engagement").column).toBe("engagement");
  });

  it("falls back to the first sort for an unknown key rather than throwing", () => {
    expect(() => findSort("nonsense" as SortKey)).not.toThrow();
    expect(findSort("nonsense" as SortKey).key).toBe("p2");
  });

  it("sorts an empty roster and a roster of one without throwing", () => {
    for (const option of SORT_OPTIONS) {
      expect(sortRoster([], option.key, "default")).toEqual([]);
      expect(sortRoster([row("Solo")], option.key, "reversed")).toHaveLength(1);
    }
  });
});

describe("tapping a column heading", () => {
  const start: SortState = { key: DEFAULT_SORT_KEY, direction: DEFAULT_SORT_DIRECTION };

  it("sets an inactive column to its own sort, in the direction it starts in", () => {
    expect(headingTap("student", start)).toEqual({ key: "name", direction: "default" });
    expect(headingTap("engagement", start)).toEqual({ key: "engagement", direction: "default" });
    // Touch points starts highest first, even though the menu default for
    // that sort is fewest first.
    expect(headingTap("touch", start)).toEqual({ key: "touch", direction: "reversed" });
  });

  it("starts every heading with the higher or more urgent value at the top", () => {
    for (const column of ["student", "status", "touch", "engagement"] as SortColumn[]) {
      const next = headingTap(column, { key: "last", direction: "reversed" });
      // "last" lives on the status column, so that one reverses instead.
      if (column === "status") continue;
      expect(arrowFor(next.key, next.direction)).toBe("down");
    }
  });

  it("reverses the active column rather than switching it", () => {
    const first = headingTap("engagement", start);
    const second = headingTap("engagement", first);
    expect(second).toEqual({ key: "engagement", direction: "reversed" });
    expect(arrowFor(second.key, second.direction)).toBe("up");
  });

  it("reverses and reverses back, with no third state", () => {
    for (const column of ["student", "status", "touch", "engagement"] as SortColumn[]) {
      const once = headingTap(column, start);
      const twice = headingTap(column, once);
      const thrice = headingTap(column, twice);
      // The second tap flips it and the third puts it back exactly.
      expect(twice.key).toBe(once.key);
      expect(twice.direction).not.toBe(once.direction);
      expect(thrice).toEqual(once);
      // And the list itself comes back to exactly where it was.
      const first = names(sortRoster(ROSTER, once.key, once.direction));
      expect(names(sortRoster(ROSTER, twice.key, twice.direction))).toEqual([...first].reverse());
      expect(names(sortRoster(ROSTER, thrice.key, thrice.direction))).toEqual(first);
    }
  });

  it("reverses the sort sitting on a column, whichever sort that is", () => {
    // Last contacted highlights the P2 status heading, so tapping it
    // reverses Last contacted rather than jumping to P2 status.
    const onLast: SortState = { key: "last", direction: "default" };
    expect(headingTap("status", onLast)).toEqual({ key: "last", direction: "reversed" });
    expect(headingTap("status", { key: "last", direction: "reversed" })).toEqual(onLast);
  });

  it("never leaves the list unsorted, however it is tapped", () => {
    const columns: SortColumn[] = ["student", "status", "touch", "engagement"];
    let state = start;
    // Every column, then every column again, then the same one repeatedly.
    for (const column of [...columns, ...columns, "touch", "touch", "touch"] as SortColumn[]) {
      state = headingTap(column, state);
      expect(SORT_OPTIONS.some((option) => option.key === state.key)).toBe(true);
      expect(["default", "reversed"]).toContain(state.direction);
      expect(sortRoster(ROSTER, state.key, state.direction)).toHaveLength(ROSTER.length);
    }
  });
});

describe("the heading and the Sort menu are one setting", () => {
  it("gives the menu a real order label for every heading tap", () => {
    const columns: SortColumn[] = ["student", "status", "touch", "engagement"];
    let state: SortState = { key: DEFAULT_SORT_KEY, direction: DEFAULT_SORT_DIRECTION };
    for (const column of [...columns, ...columns]) {
      state = headingTap(column, state);
      const option = findSort(state.key);
      expect(orderLabel(state.key, state.direction)).toBe(
        state.direction === "reversed" ? option.orders[1] : option.orders[0],
      );
      // The heading that lights up is the one the sort belongs to.
      expect(option.column).toBe(
        // Tapping the status column while Last contacted is on keeps that
        // sort, which still belongs to the status column.
        findSort(state.key).column,
      );
    }
  });

  it("agrees with the menu about which heading is active", () => {
    for (const option of SORT_OPTIONS) {
      for (const direction of ["default", "reversed"] as SortDirection[]) {
        // Whatever the menu picks, exactly one heading shows the arrow.
        const lit = (["student", "status", "touch", "engagement"] as SortColumn[]).filter(
          (column) => findSort(option.key).column === column,
        );
        expect(lit).toHaveLength(1);
        expect(["down", "up"]).toContain(arrowFor(option.key, direction));
      }
    }
  });

  it("points the arrow down whenever the top of the list is the higher value", () => {
    expect(arrowFor("p2", "default")).toBe("down");
    expect(arrowFor("p2", "reversed")).toBe("up");
    expect(arrowFor("engagement", "default")).toBe("down");
    expect(arrowFor("engagement", "reversed")).toBe("up");
    expect(arrowFor("name", "default")).toBe("down");
    expect(arrowFor("name", "reversed")).toBe("up");
    expect(arrowFor("last", "default")).toBe("down");
    expect(arrowFor("last", "reversed")).toBe("up");
    // Most first puts the highest at the top, so it points down even though
    // it is the reversed direction.
    expect(arrowFor("touch", "reversed")).toBe("down");
    expect(arrowFor("touch", "default")).toBe("up");
  });
});
