import { describe, expect, it } from "bun:test";
import {
  SUGGESTION_LIMIT,
  focusParentNames,
  focusSuggestions,
  mondayOf,
  normaliseParentName,
  shortStudentName,
  type FocusRow,
  type SuggestableStudent,
} from "./focus";

// Today is Friday 21 August 2026, so this week's Monday is the 17th.
const THIS_WEEK = "2026-08-17";
const LAST_WEEK = "2026-08-10";

const STUDENTS: SuggestableStudent[] = [
  { id: 1, student_name: "Ruby Chen", parent_name: "Mei Chen" },
  { id: 2, student_name: "Aiden Park", parent_name: "Sun Park" },
  { id: 3, student_name: "Bella Nguyen", parent_name: "Thao Nguyen" },
  { id: 4, student_name: "Charlie Smith", parent_name: "Anna Smith" },
  { id: 5, student_name: "Dylan Ortiz", parent_name: "Rosa Ortiz" },
  { id: 6, student_name: "Ethan Wu", parent_name: "Lin Wu" },
  { id: 7, student_name: "Freya Blue", parent_name: "Kim Blue" },
];

const names = (rows: SuggestableStudent[]) => rows.map((row) => row.student_name);

function focusFor(parents: string[], weekStart = THIS_WEEK): FocusRow[] {
  return parents.map((parent_name) => ({ parent_name, week_start: weekStart }));
}

describe("which Monday the week starts on", () => {
  it("walks back to the Monday of that week", () => {
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
    expect(mondayOf("2026-08-21")).toBe("2026-08-17");
    expect(mondayOf("2026-08-23")).toBe("2026-08-17");
    expect(mondayOf("2026-08-24")).toBe("2026-08-24");
  });

  it("holds across a month and a year boundary", () => {
    expect(mondayOf("2026-09-01")).toBe("2026-08-31");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });

  it("gives nothing for a date it cannot read", () => {
    expect(mondayOf("")).toBe("");
    expect(mondayOf("not a date")).toBe("");
  });
});

describe("matching a focus row to a student", () => {
  it("trims and lowercases, the way the Parents screen does", () => {
    expect(normaliseParentName("  Mei Chen ")).toBe("mei chen");
    expect(normaliseParentName("MEI CHEN")).toBe("mei chen");
    expect(normaliseParentName(null)).toBe("");
  });

  it("takes only the named week", () => {
    const rows = [...focusFor(["Mei Chen"]), ...focusFor(["Sun Park"], LAST_WEEK)];
    expect([...focusParentNames(rows, THIS_WEEK)]).toEqual(["mei chen"]);
    expect([...focusParentNames(rows, LAST_WEEK)]).toEqual(["sun park"]);
  });

  it("gives nothing when the week is blank or unknown", () => {
    const rows = focusFor(["Mei Chen"]);
    expect(focusParentNames(rows, "").size).toBe(0);
    expect(focusParentNames(rows, "2026-07-06").size).toBe(0);
  });

  it("skips rows with no parent name", () => {
    const rows: FocusRow[] = [
      { parent_name: null, week_start: THIS_WEEK },
      ...focusFor(["Mei Chen"]),
    ];
    expect(focusParentNames(rows, THIS_WEEK).size).toBe(1);
  });
});

describe("writing a student's name for a chip", () => {
  it("gives a first name and a single initial, with no full stop", () => {
    expect(shortStudentName("Ruby Chen")).toBe("Ruby C");
    expect(shortStudentName("Charlie Smith")).toBe("Charlie S");
    expect(shortStudentName("Ruby Chen")).not.toContain(".");
  });

  it("shows the first name alone when there is no surname", () => {
    expect(shortStudentName("Ruby")).toBe("Ruby");
    expect(shortStudentName("  Ruby  ")).toBe("Ruby");
  });

  it("takes the initial from the last name, not the middle one", () => {
    expect(shortStudentName("Mary Jane Wu")).toBe("Mary W");
  });

  it("upper cases the initial and keeps the first name as written", () => {
    expect(shortStudentName("ruby chen")).toBe("ruby C");
  });

  it("gives nothing for a blank name rather than throwing", () => {
    expect(shortStudentName("")).toBe("");
    expect(shortStudentName(null)).toBe("");
    expect(() => shortStudentName(undefined)).not.toThrow();
  });
});

describe("who the strip suggests", () => {
  it("suggests the students whose parent is in this week's focus", () => {
    const found = focusSuggestions(
      STUDENTS,
      focusFor(["Mei Chen", "Sun Park"]),
      new Set(),
      THIS_WEEK,
    );
    expect(names(found)).toEqual(["Aiden Park", "Ruby Chen"]);
  });

  it("drops a student who already has a touch point this term", () => {
    const touched = new Set(["1"]);
    const found = focusSuggestions(
      STUDENTS,
      focusFor(["Mei Chen", "Sun Park"]),
      touched,
      THIS_WEEK,
    );
    expect(names(found)).toEqual(["Aiden Park"]);
  });

  it("ignores a focus list written for an earlier week", () => {
    const rows = focusFor(["Mei Chen", "Sun Park"], LAST_WEEK);
    expect(focusSuggestions(STUDENTS, rows, new Set(), THIS_WEEK)).toEqual([]);
  });

  it("shows at most five, however many are in the focus", () => {
    const everyone = STUDENTS.map((student) => student.parent_name ?? "");
    const found = focusSuggestions(STUDENTS, focusFor(everyone), new Set(), THIS_WEEK);
    expect(found).toHaveLength(SUGGESTION_LIMIT);
    expect(SUGGESTION_LIMIT).toBe(5);
  });

  it("shows nothing when every focus student already has a touch point", () => {
    const touched = new Set(["1", "2"]);
    expect(
      focusSuggestions(STUDENTS, focusFor(["Mei Chen", "Sun Park"]), touched, THIS_WEEK),
    ).toEqual([]);
  });

  it("shows nothing when the focus table is empty", () => {
    expect(focusSuggestions(STUDENTS, [], new Set(), THIS_WEEK)).toEqual([]);
  });

  it("shows nothing when no student matches the parents in the focus", () => {
    expect(focusSuggestions(STUDENTS, focusFor(["Someone Else"]), new Set(), THIS_WEEK)).toEqual(
      [],
    );
  });

  it("matches through case and surrounding spaces", () => {
    const found = focusSuggestions(STUDENTS, focusFor(["  MEI CHEN "]), new Set(), THIS_WEEK);
    expect(names(found)).toEqual(["Ruby Chen"]);
  });

  it("gives the same order every time, whatever order the roster arrives in", () => {
    const rows = focusFor(STUDENTS.map((student) => student.parent_name ?? ""));
    const forward = names(focusSuggestions(STUDENTS, rows, new Set(), THIS_WEEK));
    const backward = names(focusSuggestions([...STUDENTS].reverse(), rows, new Set(), THIS_WEEK));
    expect(backward).toEqual(forward);
  });

  it("suggests both siblings when they share a parent", () => {
    const siblings: SuggestableStudent[] = [
      { id: 10, student_name: "One Chen", parent_name: "Mei Chen" },
      { id: 11, student_name: "Two Chen", parent_name: "Mei Chen" },
    ];
    expect(names(focusSuggestions(siblings, focusFor(["Mei Chen"]), new Set(), THIS_WEEK))).toEqual(
      ["One Chen", "Two Chen"],
    );
  });
});
