import { describe, expect, it } from "bun:test";
import {
  ROSTER_FILTERS,
  applyFilter,
  countFor,
  findFilter,
  tileCount,
  toggleFilter,
  type FilterKey,
  type FilterableRow,
} from "./rosterFilters";

type Row = FilterableRow & { name: string };

function row(name: string, over: Partial<FilterableRow> = {}): Row {
  return { name, done: false, overdue: false, focus: false, touchPoints: 0, ...over };
}

// One roster covering every combination the screen can hold: done students
// with and without touch points, an overdue student, a focus student, and a
// student who is fine on P2 but has never been touched.
const ROSTER: Row[] = [
  row("Done, touched", { done: true, touchPoints: 3 }),
  row("Done, never touched", { done: true, touchPoints: 0 }),
  row("Overdue, touched", { overdue: true, touchPoints: 1 }),
  row("Overdue, never touched", { overdue: true, touchPoints: 0 }),
  row("Focus, touched", { focus: true, touchPoints: 2 }),
  row("Outstanding, never touched", { touchPoints: 0 }),
];

const names = (rows: Row[]) => rows.map((entry) => entry.name).sort();

describe("each filter returns exactly the students its tile counts", () => {
  it("P2 Complete shows students whose P2 is complete", () => {
    expect(names(applyFilter("complete", ROSTER))).toEqual([
      "Done, never touched",
      "Done, touched",
    ]);
  });

  it("P2 Outstanding shows students whose P2 is not complete", () => {
    expect(names(applyFilter("outstanding", ROSTER))).toEqual([
      "Focus, touched",
      "Outstanding, never touched",
      "Overdue, never touched",
      "Overdue, touched",
    ]);
  });

  it("P2 Overdue shows students who are overdue", () => {
    expect(names(applyFilter("overdue", ROSTER))).toEqual([
      "Overdue, never touched",
      "Overdue, touched",
    ]);
  });

  it("Focus this week shows the students that tile counts", () => {
    expect(names(applyFilter("focus", ROSTER))).toEqual(["Focus, touched"]);
  });

  it("No touch point shows students with no touch point this term", () => {
    expect(names(applyFilter("no-touch", ROSTER))).toEqual([
      "Done, never touched",
      "Outstanding, never touched",
      "Overdue, never touched",
    ]);
  });

  it("counts a student whose badge shows zero, done or not", () => {
    const noTouch = applyFilter("no-touch", ROSTER);
    expect(noTouch.some((entry) => entry.done)).toBe(true);
    expect(noTouch.every((entry) => entry.touchPoints === 0)).toBe(true);
  });

  it("splits the roster exactly between complete and outstanding", () => {
    const complete = applyFilter("complete", ROSTER).length;
    const outstanding = applyFilter("outstanding", ROSTER).length;
    expect(complete + outstanding).toBe(ROSTER.length);
  });

  it("shows every student when no filter is on", () => {
    expect(applyFilter(null, ROSTER)).toHaveLength(ROSTER.length);
  });
});

describe("a tile's number and its list can never disagree", () => {
  it("holds for every filter on the whole roster", () => {
    for (const filter of ROSTER_FILTERS) {
      expect(countFor(filter.key, ROSTER)).toBe(applyFilter(filter.key, ROSTER).length);
    }
  });

  it("holds on an empty roster and on a roster of one", () => {
    for (const rows of [[], [row("Only", { done: true, touchPoints: 1 })]]) {
      for (const filter of ROSTER_FILTERS) {
        expect(countFor(filter.key, rows)).toBe(applyFilter(filter.key, rows).length);
      }
    }
  });

  it("holds however the roster is shuffled, because both read one rule", () => {
    const shuffled = [...ROSTER].reverse();
    for (const filter of ROSTER_FILTERS) {
      expect(countFor(filter.key, shuffled)).toBe(countFor(filter.key, ROSTER));
    }
  });
});

describe("only one filter is ever active", () => {
  it("clears when the same tile is tapped twice", () => {
    const first = toggleFilter(null, "overdue");
    expect(first).toBe("overdue");
    expect(toggleFilter(first, "overdue")).toBeNull();
  });

  it("swaps rather than combining when a second tile is tapped", () => {
    const first = toggleFilter(null, "complete");
    const second = toggleFilter(first, "no-touch");
    expect(second).toBe("no-touch");
    // The previous filter is gone, not added to.
    expect(applyFilter(second, ROSTER).every((entry) => entry.touchPoints === 0)).toBe(true);
    expect(applyFilter(second, ROSTER).some((entry) => !entry.done)).toBe(true);
  });

  it("swaps cleanly between every pair of tiles", () => {
    for (const from of ROSTER_FILTERS) {
      for (const to of ROSTER_FILTERS) {
        const next = toggleFilter(from.key, to.key);
        expect(next).toBe(from.key === to.key ? null : to.key);
      }
    }
  });
});

describe("the tile vocabulary", () => {
  it("offers exactly the five filtering tiles, in order", () => {
    expect(ROSTER_FILTERS.map((filter) => filter.key)).toEqual([
      "complete",
      "outstanding",
      "overdue",
      "focus",
      "no-touch",
    ]);
  });

  it("puts No touch point fifth, with the warning tint", () => {
    const fifth = ROSTER_FILTERS[4]!;
    expect(fifth.tile).toBe("No touch point");
    expect(fifth.tone).toBe("warning");
    // The four P2 tiles take the accent tint.
    for (const filter of ROSTER_FILTERS.slice(0, 4)) expect(filter.tone).toBe("accent");
  });

  it("has wording for the bar and for an empty list on every filter", () => {
    for (const filter of ROSTER_FILTERS) {
      expect(filter.showing.startsWith("Showing students")).toBe(true);
      expect(filter.empty.startsWith("Nothing to show.")).toBe(true);
    }
  });

  it("does not include P2 Rate, which is a percentage rather than a list", () => {
    expect(ROSTER_FILTERS.map((filter) => filter.tile)).not.toContain("P2 Rate");
    expect(ROSTER_FILTERS).toHaveLength(5);
  });

  it("finds a filter by key and nothing for no filter", () => {
    expect(findFilter("focus")?.tile).toBe("Focus this week");
    expect(findFilter(null)).toBeNull();
    expect(findFilter("not a tile" as FilterKey)).toBeNull();
  });
});

describe("rendering a tile number", () => {
  it("renders a zero as one character, not two", () => {
    expect(tileCount(0)).toBe("0");
    expect(tileCount(0)).toHaveLength(1);
  });

  it("keeps the deliberate padding on a real count", () => {
    expect(tileCount(7)).toBe("07");
    expect(tileCount(18)).toBe("18");
    expect(tileCount(165)).toBe("165");
  });
});
