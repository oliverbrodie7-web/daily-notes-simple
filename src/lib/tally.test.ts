import { describe, expect, it } from "bun:test";
import { reachedCount, studentsReached, tallyNotes, tallyView, type TallyNote } from "./tally";
import { matchCount, matchTouchPoints, type TouchPointNote } from "./touchPoints";
import { sydneyDateIso } from "./dates";
import { mondayOf } from "./focus";

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

describe("a note counts the moment it is written", () => {
  // The counters count notes written. The bar counts parents reached, which
  // is a different question, so it keeps the draft rule. This block is the
  // one that used to say the opposite.
  it("counts a note written today with no draft in all three counters", () => {
    const notes = [note({ note_date: MONDAY, draft_created: false })];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 1, week: 1, term: 1 });
  });

  it("does not count that same note in the bar", () => {
    const notes = [note({ student_name: "Alice D", draft_created: false })];
    expect(reachedCount(notes, STUDENTS)).toBe(0);
  });

  it("counts an undrafted note in the week and the term as well", () => {
    const notes = [
      note({ note_date: MONDAY, draft_created: false }),
      note({ note_date: SUNDAY_BEFORE, draft_created: false }),
    ];
    expect(tallyNotes(notes, MONDAY)).toEqual({ today: 1, week: 1, term: 2 });
  });

  it("counts drafted and undrafted notes alike", () => {
    const notes = [
      note({ note_date: MONDAY, draft_created: true }),
      note({ note_date: MONDAY, draft_created: false }),
      note({ note_date: MONDAY, draft_created: null }),
    ];
    expect(tallyNotes(notes, MONDAY).today).toBe(3);
  });

  it("moves the bar and none of the counters when a note gains a draft", () => {
    const before = [note({ student_name: "Alice D", note_date: MONDAY, draft_created: false })];
    // The same note, later that evening, once the nightly job has run.
    const after = [note({ student_name: "Alice D", note_date: MONDAY, draft_created: true })];

    expect(tallyNotes(after, MONDAY)).toEqual(tallyNotes(before, MONDAY));
    expect(reachedCount(before, STUDENTS)).toBe(0);
    expect(reachedCount(after, STUDENTS)).toBe(1);
  });

  it("keeps the two halves apart across a whole day", () => {
    // Three notes written this afternoon. All three counters move at once,
    // the bar does not move until tonight.
    const written = [
      note({ student_name: "Alice D", note_date: MONDAY, draft_created: false }),
      note({ student_name: "Bob T", note_date: MONDAY, draft_created: false }),
      note({ student_name: "Charlie S", note_date: MONDAY, draft_created: false }),
    ];
    expect(tallyNotes(written, MONDAY)).toEqual({ today: 3, week: 3, term: 3 });
    expect(reachedCount(written, STUDENTS)).toBe(0);

    const drafted = written.map((row) => ({ ...row, draft_created: true }));
    expect(tallyNotes(drafted, MONDAY)).toEqual({ today: 3, week: 3, term: 3 });
    expect(reachedCount(drafted, STUDENTS)).toBe(3);
  });
});

describe("adding notes only ever moves the counters up", () => {
  it("raises today, this week and this term together", () => {
    const before = tallyNotes([], MONDAY);
    const after = tallyNotes([note({ note_date: MONDAY, draft_created: false })], MONDAY);
    expect(before).toEqual({ today: 0, week: 0, term: 0 });
    expect(after).toEqual({ today: 1, week: 1, term: 1 });
  });

  it("cannot lower any counter, whatever is added and in whatever order", () => {
    // Every shape of note this screen can produce, added one at a time.
    const feed = [
      note({ note_date: MONDAY, draft_created: false }),
      note({ note_date: SUNDAY_BEFORE, draft_created: true }),
      note({ note_date: MONDAY, draft_created: true }),
      note({ note_date: "2026-07-30", draft_created: false }),
      note({ note_date: WEDNESDAY, draft_created: false }),
      note({ note_date: null, draft_created: false }),
      note({ note_date: `${MONDAY}T09:15:00Z`, draft_created: true }),
      note({ note_date: "", draft_created: true }),
    ];
    for (const day of [MONDAY, WEDNESDAY, SUNDAY_BEFORE]) {
      const running: Row[] = [];
      let last = tallyNotes(running, day);
      for (const next of feed) {
        running.push(next);
        const now = tallyNotes(running, day);
        expect(now.today).toBeGreaterThanOrEqual(last.today);
        expect(now.week).toBeGreaterThanOrEqual(last.week);
        expect(now.term).toBeGreaterThanOrEqual(last.term);
        last = now;
      }
    }
  });

  it("gives the same answer whatever order the notes arrive in", () => {
    const notes = [
      note({ note_date: MONDAY }),
      note({ note_date: SUNDAY_BEFORE }),
      note({ note_date: WEDNESDAY }),
    ];
    const forwards = tallyNotes(notes, WEDNESDAY);
    const backwards = tallyNotes([...notes].reverse(), WEDNESDAY);
    expect(backwards).toEqual(forwards);
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

  it("counts a note written today with no draft, and leaves the bar alone", () => {
    const fresh = [note({ student_name: "Alice D", note_date: today, draft_created: false })];
    const view = tallyView({ failed: false, notes: fresh, students: STUDENTS, today });
    if (view.kind !== "ready") throw new Error("expected the numbers");
    expect(view.tally).toEqual({ today: 1, week: 1, term: 1 });
    expect(view.reached).toEqual({ reached: 0, total: 3, rate: 0 });
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

describe("the week boundary is Sydney's Monday, not the browser's", () => {
  // 6am Monday in Sydney is still Sunday evening in UTC, and in London, and
  // in New York. A browser reading its own clock would put this instant in
  // the week before, a whole seven days out.
  const instant = new Date("2026-08-23T20:00:00Z");

  it("puts that instant on Sydney's Monday", () => {
    expect(sydneyDateIso(instant)).toBe("2026-08-24");
    expect(mondayOf(sydneyDateIso(instant))).toBe("2026-08-24");
  });

  it("would be a week out if the browser's own clock were used", () => {
    const browserDay = instant.toISOString().slice(0, 10);
    expect(browserDay).toBe("2026-08-23");
    expect(mondayOf(browserDay)).toBe("2026-08-17");
  });

  it("gives the same answer whatever zone the browser is in", () => {
    // The same instant, as several browsers would read their own clock.
    const elsewhere = ["UTC", "Europe/London", "America/New_York", "Pacific/Auckland"].map((zone) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(instant),
    );
    // They do not all agree with each other.
    expect(new Set(elsewhere).size).toBeGreaterThan(1);
    // Sydney's answer is one value and none of theirs can move it.
    expect(sydneyDateIso(instant)).toBe("2026-08-24");
  });

  it("uses the one helper rather than a second version of it", () => {
    const source = require("node:fs").readFileSync(
      new URL("./tally.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    expect(source).toContain('import { mondayOf } from "./focus"');
    expect(source).toContain("mondayOf(today)");
    // Nothing here works a Monday out for itself.
    expect(source).not.toContain("getUTCDay");
    expect(source).not.toContain("86_400_000");
  });

  it("counts every day of the Sydney week and nothing before it", () => {
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
      note({ note_date: "2026-08-23" }),
    ];
    const tally = tallyNotes(notes, "2026-08-30");
    expect(tally.week).toBe(7);
    expect(tally.term).toBe(8);
  });
});

describe("the strip and the match line answer to different rules", () => {
  // The match line under a note excludes notes dated today, because it is
  // saying what came before. The strip counts today. Neither may leak into
  // the other.
  const TODAY = "2026-08-25";
  const EARLIER = "2026-08-24";
  const notes = [
    note({ student_name: "Alice D", note_date: EARLIER, draft_created: true }),
    note({ student_name: "Alice D", note_date: TODAY, draft_created: true }),
  ];

  it("counts today's note in the strip", () => {
    expect(tallyNotes(notes, TODAY)).toEqual({ today: 1, week: 2, term: 2 });
  });

  it("leaves today's note out of the match line", () => {
    const summaries = matchTouchPoints(notes, STUDENTS);
    expect(summaries.get("1")?.count).toBe(2);
    expect(matchCount(summaries, 1, TODAY)?.count).toBe(1);
    expect(matchCount(summaries, 1, TODAY)?.line).toBe("1 other touch point this term");
  });

  it("keeps the exclude today rule out of the strip's own module", () => {
    const source = require("node:fs").readFileSync(
      new URL("./tally.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    expect(source).not.toContain("matchCount");
    expect(source).not.toContain("!== today");
  });
});

describe("how the screen hands the date in", () => {
  const screen = require("node:fs").readFileSync(
    new URL("../components/TodayScreen.tsx", import.meta.url).pathname,
    "utf8",
  ) as string;

  it("holds today rather than reading it inside the sums", () => {
    // The bug: sydneyTodayIso() was called inside a useMemo that did not
    // list it, so the week boundary could be worked out from yesterday.
    expect(screen).toContain("const [today, setToday] = useState(sydneyTodayIso)");
    expect(screen).not.toContain("today: sydneyTodayIso()");
    expect(screen).not.toContain("mondayOf(sydneyTodayIso())");
  });

  it("makes that date a dependency of the numbers", () => {
    expect(screen).toContain("[termDataFailed, termNotes, students, today]");
  });

  it("refreshes it rather than capturing it once", () => {
    expect(screen).toContain("visibilitychange");
    expect(screen).toContain("setInterval");
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
