import { describe, expect, it } from "bun:test";
import {
  closestStudents,
  latestTidiedText,
  matchNote,
  matchCount,
  matchTouchPoints,
  normaliseStudentName,
  touchPointsLine,
} from "./touchPoints";

const STUDENTS = [
  { id: 1, student_name: "Aiden Chen" },
  { id: 2, student_name: "Bella Nguyen" },
];

function note(
  student_name: string | null,
  note_date = "2026-08-10",
  added_by = "Sarah",
  draft_created: boolean | null = true,
  student_id: string | null = null,
) {
  return {
    student_id,
    student_name,
    note_date,
    note_text: "Worked on fractions.",
    tidied_text: null,
    added_by,
    draft_created,
  };
}

describe("normalising a typed student name", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normaliseStudentName("  Aiden   Chen ")).toBe("aiden chen");
    expect(normaliseStudentName("AIDEN CHEN")).toBe("aiden chen");
    expect(normaliseStudentName("Aiden\tChen")).toBe("aiden chen");
  });

  it("treats a missing name as empty", () => {
    expect(normaliseStudentName(null)).toBe("");
    expect(normaliseStudentName("   ")).toBe("");
  });
});

describe("matching notes to students", () => {
  it("attributes a note when exactly one active student matches", () => {
    const matched = matchTouchPoints([note("Aiden Chen")], STUDENTS);
    expect(matched.get("1")?.count).toBe(1);
    expect(matched.get("2")).toBeUndefined();
  });

  it("matches through case and spacing differences", () => {
    const matched = matchTouchPoints([note("  aiden   CHEN ")], STUDENTS);
    expect(matched.get("1")?.count).toBe(1);
  });

  it("records nothing when no active student matches", () => {
    const matched = matchTouchPoints([note("Jesse Turner")], STUDENTS);
    expect(matched.size).toBe(0);
  });

  it("records nothing when the name is ambiguous, rather than guessing", () => {
    const twins = [
      { id: 1, student_name: "Sam Reid" },
      { id: 2, student_name: "Sam Reid" },
    ];
    const matched = matchTouchPoints([note("Sam Reid")], twins);
    expect(matched.size).toBe(0);
  });

  it("records nothing for a note with no student name", () => {
    expect(matchTouchPoints([note(null), note("   ")], STUDENTS).size).toBe(0);
  });

  it("counts several notes for the same student and keeps the latest date", () => {
    const matched = matchTouchPoints(
      [
        note("Aiden Chen", "2026-08-03"),
        note("Aiden Chen", "2026-08-11"),
        note("Aiden Chen", "2026-08-07"),
      ],
      STUDENTS,
    );
    expect(matched.get("1")?.count).toBe(3);
    expect(matched.get("1")?.latestDate).toBe("2026-08-11");
  });

  it("orders the entries newest first", () => {
    const matched = matchTouchPoints(
      [
        note("Aiden Chen", "2026-08-03"),
        note("Aiden Chen", "2026-08-11"),
        note("Aiden Chen", "2026-08-07"),
      ],
      STUDENTS,
    );
    expect(matched.get("1")?.entries.map((entry) => entry.date)).toEqual([
      "2026-08-11",
      "2026-08-07",
      "2026-08-03",
    ]);
  });

  it("counts a note only once a draft was created for it", () => {
    const withDraft = matchTouchPoints([note("Aiden Chen", "2026-08-10", "Sarah", true)], STUDENTS);
    expect(withDraft.get("1")?.count).toBe(1);

    const heldBack = matchTouchPoints([note("Aiden Chen", "2026-08-10", "Sarah", false)], STUDENTS);
    expect(heldBack.size).toBe(0);
  });

  it("treats a missing draft flag as no draft rather than assuming one", () => {
    expect(matchTouchPoints([note("Aiden Chen", "2026-08-10", "Sarah", null)], STUDENTS).size).toBe(
      0,
    );
  });

  it("keeps undrafted notes out of the panel entries as well as the count", () => {
    const matched = matchTouchPoints(
      [
        note("Aiden Chen", "2026-08-11", "Sarah", true),
        note("Aiden Chen", "2026-08-10", "Priya", false),
        note("Aiden Chen", "2026-08-09", "Sarah", true),
      ],
      STUDENTS,
    );
    expect(matched.get("1")?.count).toBe(2);
    expect(matched.get("1")?.entries.map((entry) => entry.date)).toEqual([
      "2026-08-11",
      "2026-08-09",
    ]);
    expect(matched.get("1")?.latestDate).toBe("2026-08-11");
  });

  it("keeps the staff member and the note text for the panel", () => {
    const matched = matchTouchPoints([note("Aiden Chen", "2026-08-10", "Priya")], STUDENTS);
    const entry = matched.get("1")?.entries[0];
    expect(entry?.addedBy).toBe("Priya");
    expect(entry?.text).toBe("Worked on fractions.");
  });
});

// The roster the four step rule is exercised against. Charlie Smith and
// Charlie Sanders exist so the initial rule has a real collision to face,
// and Bella appears once so a bare first name has a unique answer.
const ROSTER = [
  { id: "s1", student_name: "Charlie Smith", parent_name: "Anna Smith" },
  { id: "s2", student_name: "Charlie Sanders", parent_name: "Rita Sanders" },
  { id: "s3", student_name: "Charlie Tran", parent_name: "Minh Tran" },
  { id: "s4", student_name: "Bella Nguyen", parent_name: "Thao Nguyen" },
  { id: "s5", student_name: "Mary Jane Wu", parent_name: "Lin Wu" },
];

const SMITH_ONLY = ROSTER.filter((student) => student.id !== "s2");

describe("step one: an explicit student_id", () => {
  it("beats every other rule, even a name that points elsewhere", () => {
    const match = matchNote({ student_id: "s4", student_name: "Charlie Smith" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.id).toBe("s4");
  });

  it("beats a name that would otherwise be ambiguous", () => {
    const match = matchNote({ student_id: "s1", student_name: "Charlie" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.id).toBe("s1");
  });

  it("does not fall back to guessing when the id names an inactive student", () => {
    // The student was made inactive after a person matched the note. That
    // decision still stands, so the typed name is not guessed at instead.
    const match = matchNote({ student_id: "gone", student_name: "Charlie Smith" }, ROSTER);
    expect(match.kind).toBe("unmatched");
  });

  it("ignores an empty or whitespace only id and carries on", () => {
    expect(matchNote({ student_id: "  ", student_name: "Bella Nguyen" }, ROSTER).kind).toBe(
      "matched",
    );
    expect(matchNote({ student_id: null, student_name: "Bella Nguyen" }, ROSTER).kind).toBe(
      "matched",
    );
  });
});

describe("step two: the full name", () => {
  it("matches a full name exactly", () => {
    const match = matchNote({ student_name: "Charlie Smith" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.id).toBe("s1");
  });

  it("ignores case and extra spaces", () => {
    for (const typed of ["  charlie   SMITH ", "CHARLIE SMITH", "Charlie\tSmith"]) {
      const match = matchNote({ student_name: typed }, ROSTER);
      expect(match.kind).toBe("matched");
      if (match.kind === "matched") expect(match.student.id).toBe("s1");
    }
  });

  it("is ambiguous when two active students share a full name", () => {
    const twins = [
      { id: "a", student_name: "Sam Reid" },
      { id: "b", student_name: "Sam Reid" },
    ];
    const match = matchNote({ student_name: "Sam Reid" }, twins);
    expect(match.kind).toBe("ambiguous");
    if (match.kind === "ambiguous") expect(match.candidates).toHaveLength(2);
  });
});

describe("step three: a first name and a surname initial", () => {
  it("matches Charlie S to Charlie Smith when he is the only Charlie S", () => {
    const match = matchNote({ student_name: "Charlie S" }, SMITH_ONLY);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.student_name).toBe("Charlie Smith");
  });

  it("is ambiguous when Charlie Smith and Charlie Sanders are both active", () => {
    const match = matchNote({ student_name: "Charlie S" }, ROSTER);
    expect(match.kind).toBe("ambiguous");
    if (match.kind === "ambiguous") {
      expect(match.candidates.map((student) => student.student_name)).toEqual([
        "Charlie Sanders",
        "Charlie Smith",
      ]);
    }
  });

  it("treats a trailing full stop as making no difference", () => {
    for (const typed of ["Charlie S", "Charlie S.", "charlie s.", "  Charlie   s.  "]) {
      const match = matchNote({ student_name: typed }, SMITH_ONLY);
      expect(match.kind).toBe("matched");
      if (match.kind === "matched") expect(match.student.student_name).toBe("Charlie Smith");
    }
  });

  it("never crosses to a different initial", () => {
    // Charlie Tran is a Charlie, but not a Charlie S.
    const match = matchNote({ student_name: "Charlie T" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.student_name).toBe("Charlie Tran");
  });

  it("reaches a two part given name written with an initial", () => {
    const match = matchNote({ student_name: "Mary Jane W" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.student_name).toBe("Mary Jane Wu");
  });

  it("comes back unmatched when no surname starts with the initial", () => {
    expect(matchNote({ student_name: "Charlie Z" }, ROSTER).kind).toBe("unmatched");
  });

  it("does not treat a real two word name as a first name and an initial", () => {
    // "Smith" is not a single letter, so this is a plain full name miss.
    expect(matchNote({ student_name: "Charlie Smyth" }, ROSTER).kind).toBe("unmatched");
  });
});

describe("step four: a bare first name", () => {
  it("matches when exactly one student has that first name", () => {
    const match = matchNote({ student_name: "Bella" }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.id).toBe("s4");
  });

  it("ignores case and surrounding spaces", () => {
    const match = matchNote({ student_name: "  BELLA " }, ROSTER);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.id).toBe("s4");
  });

  it("is ambiguous when three students share the first name", () => {
    const match = matchNote({ student_name: "Charlie" }, ROSTER);
    expect(match.kind).toBe("ambiguous");
    if (match.kind === "ambiguous") {
      expect(match.candidates.map((student) => student.student_name)).toEqual([
        "Charlie Sanders",
        "Charlie Smith",
        "Charlie Tran",
      ]);
    }
  });

  it("does not match a surname typed on its own", () => {
    expect(matchNote({ student_name: "Nguyen" }, ROSTER).kind).toBe("unmatched");
  });
});

describe("when nothing fits", () => {
  it("returns unmatched rather than throwing for a name matching nobody", () => {
    expect(() => matchNote({ student_name: "Zxqwv Blorptian" }, ROSTER)).not.toThrow();
    expect(matchNote({ student_name: "Zxqwv Blorptian" }, ROSTER).kind).toBe("unmatched");
  });

  it("returns unmatched for a missing or blank name", () => {
    expect(matchNote({ student_name: null }, ROSTER).kind).toBe("unmatched");
    expect(matchNote({ student_name: "   " }, ROSTER).kind).toBe("unmatched");
  });

  it("returns unmatched against an empty roster rather than throwing", () => {
    expect(() => matchNote({ student_name: "Charlie" }, [])).not.toThrow();
    expect(matchNote({ student_name: "Charlie" }, []).kind).toBe("unmatched");
  });
});

describe("inactive students", () => {
  // Only active students are ever passed in, so an inactive student cannot
  // be reached by any of the four steps.
  const activeOnly = ROSTER.filter((student) => student.id !== "s1");

  it("never matches an inactive student by full name", () => {
    expect(matchNote({ student_name: "Charlie Smith" }, activeOnly).kind).toBe("unmatched");
  });

  it("never matches an inactive student by first name and initial", () => {
    const match = matchNote({ student_name: "Charlie S" }, activeOnly);
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") expect(match.student.student_name).toBe("Charlie Sanders");
  });

  it("never counts an inactive student on the Parents screen", () => {
    const counted = matchTouchPoints([note("Charlie Smith")], activeOnly);
    expect(counted.size).toBe(0);
  });
});

describe("the Parents screen counts only resolved notes", () => {
  it("now counts a first name and initial, which it never used to", () => {
    const counted = matchTouchPoints([note("Charlie S")], SMITH_ONLY);
    expect(counted.get("s1")?.count).toBe(1);
  });

  it("counts a bare first name when it is unique", () => {
    expect(matchTouchPoints([note("Bella")], ROSTER).get("s4")?.count).toBe(1);
  });

  it("counts a note carrying a student_id whatever the typed name says", () => {
    const counted = matchTouchPoints([note("Charlie", "2026-08-10", "Sarah", true, "s3")], ROSTER);
    expect(counted.get("s3")?.count).toBe(1);
    expect(counted.size).toBe(1);
  });

  it("counts nothing for an ambiguous note, and never guesses a candidate", () => {
    expect(matchTouchPoints([note("Charlie S")], ROSTER).size).toBe(0);
    expect(matchTouchPoints([note("Charlie")], ROSTER).size).toBe(0);
  });

  it("still requires a draft before counting a newly matchable note", () => {
    expect(
      matchTouchPoints([note("Charlie S", "2026-08-10", "Sarah", false)], SMITH_ONLY).size,
    ).toBe(0);
    expect(
      matchTouchPoints([note("Charlie S", "2026-08-10", "Sarah", null)], SMITH_ONLY).size,
    ).toBe(0);
  });
});

describe("the closest students the picker offers", () => {
  it("puts a near miss on the first name first", () => {
    const near = [
      { id: "a", student_name: "Charlie Smith" },
      { id: "b", student_name: "Zara Okafor" },
      { id: "c", student_name: "Bella Nguyen" },
    ];
    expect(closestStudents("Charlei", near, 3)[0]?.student_name).toBe("Charlie Smith");
  });

  it("reads the first name out of a name written with an initial", () => {
    expect(closestStudents("Bella N", ROSTER, 3)[0]?.student_name).toBe("Bella Nguyen");
  });

  it("never offers more than the limit", () => {
    expect(closestStudents("Charlie", ROSTER, 2)).toHaveLength(2);
    expect(closestStudents("Charlie", ROSTER)).toHaveLength(5);
  });

  it("still offers something for a name resembling nobody", () => {
    // An empty panel would be a dead end, so the roster is offered anyway
    // and the search box handles the rest.
    expect(closestStudents("Zxqwv", ROSTER, 3)).toHaveLength(3);
  });

  it("falls back to the roster in name order for a blank name", () => {
    expect(closestStudents("   ", ROSTER, 2).map((student) => student.student_name)).toEqual([
      "Bella Nguyen",
      "Charlie Sanders",
    ]);
    expect(closestStudents(null, ROSTER, 1)).toHaveLength(1);
  });

  it("returns nothing for an empty roster rather than throwing", () => {
    expect(() => closestStudents("Charlie", [])).not.toThrow();
    expect(closestStudents("Charlie", [])).toEqual([]);
  });
});

describe("the tidied wording a re-engagement email quotes", () => {
  function tidied(note_date: string, tidied_text: string | null) {
    return {
      student_id: null,
      student_name: "Aiden Chen",
      note_date,
      note_text: "Raw note.",
      tidied_text,
      added_by: "Sarah",
      draft_created: true,
    };
  }

  it("takes the most recent one", () => {
    const matched = matchTouchPoints(
      [tidied("2026-08-03", "Older tidied"), tidied("2026-08-11", "Newer tidied")],
      STUDENTS,
    );
    expect(latestTidiedText(matched.get("1"))).toBe("Newer tidied");
  });

  it("skips a note with no tidied wording and takes the next", () => {
    const matched = matchTouchPoints(
      [tidied("2026-08-11", null), tidied("2026-08-09", "   "), tidied("2026-08-07", "Has one")],
      STUDENTS,
    );
    expect(latestTidiedText(matched.get("1"))).toBe("Has one");
  });

  it("gives nothing when no counting note has any", () => {
    const matched = matchTouchPoints([tidied("2026-08-11", null)], STUDENTS);
    expect(latestTidiedText(matched.get("1"))).toBeNull();
    expect(latestTidiedText(undefined)).toBeNull();
  });

  it("never takes one from a note that did not count", () => {
    // No draft, so it is not a touch point and not a source for a quote.
    const held = { ...tidied("2026-08-11", "Held back"), draft_created: false };
    expect(latestTidiedText(matchTouchPoints([held], STUDENTS).get("1"))).toBeNull();
  });
});

describe("the count on a note in Added today", () => {
  // The same map the Parents screen counts from, so this is not a second
  // calculation but the same one read a different way.
  function countFor(notes: Parameters<typeof matchTouchPoints>[0], id: string): number {
    return matchTouchPoints(notes, STUDENTS).get(id)?.count ?? 0;
  }

  it("says the same number the Parents screen shows for that student", () => {
    const notes = [note("Aiden C"), note("Aiden C", "2026-08-11"), note("Bella N")];
    const summaries = matchTouchPoints(notes, STUDENTS);
    // What the Parents screen reads.
    expect(summaries.get("1")?.count).toBe(2);
    // What the line on Today reads, out of the very same map.
    expect(touchPointsLine(countFor(notes, "1"))).toBe("2 touch points this term");
    expect(touchPointsLine(countFor(notes, "2"))).toBe("1 touch point this term");
  });

  it("does not count the note just added, because it has no draft yet", () => {
    const already = [note("Aiden C")];
    const justAdded = { ...note("Aiden C", "2026-08-24"), draft_created: false };
    expect(countFor(already, "1")).toBe(1);
    expect(countFor([...already, justAdded], "1")).toBe(1);
    expect(touchPointsLine(countFor([...already, justAdded], "1"))).toBe("1 touch point this term");
  });

  it("says nothing has happened yet when the only note has no draft", () => {
    const justAdded = [{ ...note("Aiden C"), draft_created: false }];
    expect(countFor(justAdded, "1")).toBe(0);
    expect(touchPointsLine(countFor(justAdded, "1"))).toBe("No touch points yet this term");
  });

  it("is singular at one and plural at everything else", () => {
    expect(touchPointsLine(1)).toBe("1 touch point this term");
    expect(touchPointsLine(2)).toBe("2 touch points this term");
    expect(touchPointsLine(5)).toBe("5 touch points this term");
  });

  it("says none at nought, and never a negative", () => {
    expect(touchPointsLine(0)).toBe("No touch points yet this term");
    expect(touchPointsLine(-3)).toBe("No touch points yet this term");
  });

  it("never claims a touch point for a note that matched nobody", () => {
    expect(countFor([note("Somebody Else")], "1")).toBe(0);
  });

  it("counts a student once per note, not once per student", () => {
    const notes = [note("Aiden C"), note("Aiden C"), note("Aiden C")];
    expect(countFor(notes, "1")).toBe(3);
    expect(touchPointsLine(countFor(notes, "1"))).toBe("3 touch points this term");
  });

  it("has something to open exactly when the count is above nought", () => {
    const none = matchTouchPoints([{ ...note("Aiden C"), draft_created: false }], STUDENTS);
    const some = matchTouchPoints([note("Aiden C")], STUDENTS);
    // Nothing in the map means plain text and no button on the line.
    expect(none.get("1")).toBeUndefined();
    expect(some.get("1")?.entries).toHaveLength(1);
  });
});

describe("what the line shows when the read went wrong", () => {
  const notes = [note("Aiden C"), note("Aiden C", "2026-08-11")];
  const summaries = matchTouchPoints(notes, STUDENTS);

  it("shows the count and offers to open it when there is history", () => {
    expect(matchCount(summaries, 1)).toEqual({
      count: 2,
      line: "2 touch points this term",
      canOpen: true,
    });
  });

  it("shows the count but offers nothing to open when there is none", () => {
    expect(matchCount(summaries, 2)).toEqual({
      count: 0,
      line: "No touch points yet this term",
      canOpen: false,
    });
  });

  it("leaves the line alone entirely when there is nothing to count from", () => {
    // A failed read, or one that has not arrived. No count, no button, and
    // the note itself still renders: a missing count is a small problem and
    // a broken Added today list is not.
    expect(matchCount(null, 1)).toBeNull();
    expect(matchCount(null, 2)).toBeNull();
  });

  it("takes a number or a string id, since ids come back as both", () => {
    expect(matchCount(summaries, "1")?.count).toBe(2);
    expect(matchCount(summaries, 1)?.count).toBe(2);
  });
});
