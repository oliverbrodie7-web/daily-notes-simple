import { describe, expect, it } from "bun:test";
import {
  hasDraft,
  reachedCount,
  studentsReached,
  tallyNotes,
  tallyView,
  type TallyNote,
} from "./tally";
import type { TouchPointNote } from "./touchPoints";

type Row = TouchPointNote & TallyNote;

function note(over: Partial<Row> = {}): Row {
  return {
    student_id: null,
    student_name: "Alice D",
    note_date: "2026-08-24",
    note_text: "Decimals. All good.",
    tidied_text: null,
    added_by: "JD",
    draft_created: true,
    ...over,
  };
}

const STUDENTS = [
  { id: 1, student_name: "Alice Dunn", parent_name: "Sarah Dunn" },
  { id: 2, student_name: "Bob Turner", parent_name: "Kim Turner" },
  { id: 3, student_name: "Charlie Smith", parent_name: "Pat Smith" },
];

// A Monday, so the week boundary is easy to reason about.
const MONDAY = "2026-08-24";
const SUNDAY_BEFORE = "2026-08-23";
const WEDNESDAY = "2026-08-26";

describe("only a drafted note counts", () => {
  it("counts a note a draft was created for", () => {
    expect(hasDraft({ note_date: MONDAY, draft_created: true })).toBe(true);
  });

  it("does not count one held back with no draft", () => {
    expect(hasDraft({ note_date: MONDAY, draft_created: false })).toBe(false);
    expect(hasDraft({ note_date: MONDAY, draft_created: null })).toBe(false);
  });

  it("counts a note without a draft nowhere at all", () => {
    const notes = [
      note({ note_date: MONDAY, draft_created: false }),
      note({ note_date: SUNDAY_BEFORE, draft_created: false }),
    ];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 0, week: 0, term: 0 });
  });

  it("leaves a student unreached when their only note has no draft", () => {
    const notes = [note({ student_name: "Alice D", draft_created: false })];
    expect(reachedCount(notes, STUDENTS)).toBe(0);
  });

  it("counts the drafted ones and passes over the rest", () => {
    const notes = [
      note({ note_date: MONDAY, draft_created: true }),
      note({ note_date: MONDAY, draft_created: false }),
      note({ note_date: MONDAY, draft_created: true }),
    ];
    expect(tallyNotes(notes, MONDAY).today).toBe(2);
  });
});

describe("the three numbers", () => {
  it("counts today, the week and the term", () => {
    const notes = [
      note({ note_date: WEDNESDAY }),
      note({ note_date: WEDNESDAY }),
      note({ note_date: MONDAY }),
      note({ note_date: SUNDAY_BEFORE }),
      note({ note_date: "2026-07-30" }),
    ];
    expect(tallyNotes(notes, WEDNESDAY)).toEqual({ today: 2, week: 3, term: 5 });
  });

  it("counts notes written, not students", () => {
    const notes = [
      note({ student_name: "Alice D", note_date: MONDAY }),
      note({ student_name: "Alice D", note_date: MONDAY }),
      note({ student_name: "Alice D", note_date: MONDAY }),
    ];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 3, week: 3, term: 3 });
  });

  it("counts nothing on an empty term", () => {
    expect(tallyNotes([], MONDAY)).toEqual({ today: 0, week: 0, term: 0 });
  });

  it("still counts a note towards the term when its date is unreadable", () => {
    // It came back from a read scoped to the term, so it belongs to the
    // term even if the date cannot be placed in a week.
    const notes = [note({ note_date: null }), note({ note_date: "" })];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 0, week: 0, term: 2 });
  });

  it("reads a timestamp as its date", () => {
    const notes = [note({ note_date: `${MONDAY}T09:15:00Z` })];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 1, week: 1, term: 1 });
  });
});

describe("the week runs from Monday", () => {
  it("takes Monday itself as the start of the week", () => {
    const notes = [note({ note_date: MONDAY })];
    expect(tallyNotes(notes, MONDAY).week).toBe(1);
  });

  it("leaves the Sunday before out of the week", () => {
    const notes = [note({ note_date: SUNDAY_BEFORE })];
    const tally = tallyNotes(notes, MONDAY);
    expect(tally.week).toBe(0);
    expect(tally.term).toBe(1);
  });

  it("counts back to Monday from a Sunday, not forward", () => {
    // The Sunday at the end of that same week, which is the day the week
    // boundary is easiest to get wrong.
    const sunday = "2026-08-30";
    const notes = [
      note({ note_date: MONDAY }),
      note({ note_date: WEDNESDAY }),
      note({ note_date: sunday }),
      note({ note_date: SUNDAY_BEFORE }),
    ];
    const tally = tallyNotes(notes, sunday);
    expect(tally.week).toBe(3);
    expect(tally.today).toBe(1);
  });

  it("counts every day of one week and nothing either side", () => {
    const week = [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ];
    const notes = [
      ...week.map((date) => note({ note_date: date })),
      // The Sunday before, which belongs to the term but not to this week.
      note({ note_date: "2026-08-23" }),
    ];
    const tally = tallyNotes(notes, "2026-08-30");
    expect(tally.week).toBe(7);
    expect(tally.term).toBe(8);
  });
});

describe("students reached", () => {
  it("counts a student once however many notes they have", () => {
    const notes = [
      note({ student_name: "Alice D" }),
      note({ student_name: "Alice D" }),
      note({ student_name: "Alice D" }),
    ];
    expect(reachedCount(notes, STUDENTS)).toBe(1);
  });

  it("moves the three numbers but not the bar on a second note", () => {
    const one = [note({ student_name: "Alice D", note_date: MONDAY })];
    const two = [...one, note({ student_name: "Alice D", note_date: MONDAY })];

    const before = {
      tally: tallyNotes(one, MONDAY),
      reached: studentsReached(reachedCount(one, STUDENTS), STUDENTS.length),
    };
    const after = {
      tally: tallyNotes(two, MONDAY),
      reached: studentsReached(reachedCount(two, STUDENTS), STUDENTS.length),
    };

    expect(before.tally).toEqual({ today: 1, week: 1, term: 1 });
    expect(after.tally).toEqual({ today: 2, week: 2, term: 2 });
    // The bar does not move, because the goal is one touch point per
    // student and Alice was already reached.
    expect(after.reached).toEqual(before.reached);
    expect(after.reached.reached).toBe(1);
  });

  it("moves the bar when a different student is written about", () => {
    const notes = [note({ student_name: "Alice D" }), note({ student_name: "Bob T" })];
    expect(reachedCount(notes, STUDENTS)).toBe(2);
  });

  it("does not count a note that matched nobody", () => {
    const notes = [note({ student_name: "Someone Else Entirely" })];
    expect(reachedCount(notes, STUDENTS)).toBe(0);
  });

  it("does not count a name two students could both answer to", () => {
    const two = [
      { id: 1, student_name: "Alice Dunn" },
      { id: 2, student_name: "Alice Dawson" },
    ];
    expect(reachedCount([note({ student_name: "Alice D" })], two)).toBe(0);
  });
});

describe("the percentage and the count agree", () => {
  it("rounds to a whole number", () => {
    expect(studentsReached(96, 162)).toEqual({ reached: 96, total: 162, rate: 59 });
  });

  it("shows nought when nobody has been reached", () => {
    expect(studentsReached(0, 162).rate).toBe(0);
  });

  it("shows a hundred when every one has been", () => {
    expect(studentsReached(162, 162).rate).toBe(100);
  });

  it("shows nought rather than dividing by zero on an empty roster", () => {
    expect(studentsReached(0, 0)).toEqual({ reached: 0, total: 0, rate: 0 });
  });

  it("never claims more reached than there are students", () => {
    expect(studentsReached(200, 162)).toEqual({ reached: 162, total: 162, rate: 100 });
    expect(studentsReached(-4, 162).reached).toBe(0);
  });

  it("always says what the count says, at every value", () => {
    const total = 162;
    for (let reached = 0; reached <= total; reached += 1) {
      const shown = studentsReached(reached, total);
      expect(shown.rate).toBe(Math.round((shown.reached / shown.total) * 100));
      expect(shown.reached).toBe(reached);
    }
  });
});

describe("what the strip shows", () => {
  const today = MONDAY;
  const notes = [note({ student_name: "Alice D", note_date: MONDAY })];

  it("hides itself when the read failed, rather than showing zeros", () => {
    const view = tallyView({ failed: true, notes: null, students: null, today });
    expect(view.kind).toBe("hidden");
  });

  it("stays hidden even when it has numbers it could show", () => {
    // Numbers that arrived alongside a failure are not to be trusted, and a
    // wrong number here is worse than no strip.
    const view = tallyView({ failed: true, notes, students: STUDENTS, today });
    expect(view.kind).toBe("hidden");
  });

  it("is still loading until both the notes and the roster arrive", () => {
    expect(tallyView({ failed: false, notes: null, students: STUDENTS, today }).kind).toBe(
      "loading",
    );
    expect(tallyView({ failed: false, notes, students: null, today }).kind).toBe("loading");
  });

  it("shows the numbers once both have", () => {
    const view = tallyView({ failed: false, notes, students: STUDENTS, today });
    expect(view.kind).toBe("ready");
    if (view.kind !== "ready") throw new Error("expected the numbers");
    expect(view.tally).toEqual({ today: 1, week: 1, term: 1 });
    expect(view.reached).toEqual({ reached: 1, total: 3, rate: 33 });
  });

  it("shows zeros rather than hiding when there is simply nothing yet", () => {
    const view = tallyView({ failed: false, notes: [], students: STUDENTS, today });
    expect(view.kind).toBe("ready");
    if (view.kind !== "ready") throw new Error("expected the numbers");
    expect(view.tally).toEqual({ today: 0, week: 0, term: 0 });
    expect(view.reached).toEqual({ reached: 0, total: 3, rate: 0 });
  });

  it("keeps the two halves apart on a roster written about unevenly", () => {
    const many = [
      note({ student_name: "Alice D" }),
      note({ student_name: "Alice D" }),
      note({ student_name: "Alice D" }),
      note({ student_name: "Bob T" }),
    ];
    const view = tallyView({ failed: false, notes: many, students: STUDENTS, today });
    if (view.kind !== "ready") throw new Error("expected the numbers");
    expect(view.tally.term).toBe(4);
    expect(view.reached.reached).toBe(2);
  });
});

describe("nothing here writes anything", () => {
  it("exports no function that could reach the database", () => {
    const source = require("node:fs").readFileSync(
      new URL("./tally.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    for (const forbidden of [
      "supabase",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "fetch(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
