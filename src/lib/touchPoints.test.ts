import { describe, expect, it } from "bun:test";
import { matchTouchPoints, normaliseStudentName } from "./touchPoints";

const STUDENTS = [
  { id: 1, student_name: "Aiden Chen" },
  { id: 2, student_name: "Bella Nguyen" },
];

function note(
  student_name: string | null,
  note_date = "2026-08-10",
  added_by = "Sarah",
  draft_created: boolean | null = true,
) {
  return { student_name, note_date, note_text: "Worked on fractions.", added_by, draft_created };
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
