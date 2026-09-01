import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { backlogLine, backlogRows, shortText, type BacklogNote } from "./backlog";

const TODAY = "2026-08-30";

const ROSTER = [
  { id: 1, student_name: "Ruby Ashford", parent_name: "Mrs Ashford" },
  { id: 2, student_name: "Ruby Bennett", parent_name: "Mr Bennett" },
  { id: 3, student_name: "Ruby Calloway", parent_name: "Ms Calloway" },
  { id: 7, student_name: "Austin Dowling", parent_name: "Mrs Dowling" },
];

function note(over: Partial<BacklogNote> & { id: string }): BacklogNote {
  return {
    student_id: null,
    student_name: "Zebedee Quibble",
    note_date: "2026-08-28",
    note_text: "Worked steadily.",
    created_at: "2026-08-28T04:00:00.000Z",
    ...over,
  };
}

describe("what the backlog holds", () => {
  test("the backlog lists an earlier note with no student_id that cannot be resolved", () => {
    const rows = backlogRows([note({ id: "a" })], ROSTER, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note.id).toBe("a");
    expect(rows[0]?.match.kind).toBe("unmatched");
  });

  test("the backlog excludes notes from today", () => {
    const rows = backlogRows(
      [note({ id: "a", note_date: TODAY }), note({ id: "b", note_date: "2026-08-28" })],
      ROSTER,
      TODAY,
    );
    expect(rows.map((row) => row.note.id)).toEqual(["b"]);
  });

  test("the backlog excludes notes that already have a student_id", () => {
    const rows = backlogRows(
      [note({ id: "a", student_id: "1" }), note({ id: "b" })],
      ROSTER,
      TODAY,
    );
    expect(rows.map((row) => row.note.id)).toEqual(["b"]);
  });

  test("an id pointing at a student who has since left is still an answer", () => {
    // This is what the student_id guard is for. matchNote calls such a note
    // unmatched, because there is nobody active to count it against, but
    // somebody did answer for it and it is not waiting on anyone.
    const gone = note({ id: "a", student_id: "999", student_name: "Zebedee Quibble" });
    const rows = backlogRows([gone, note({ id: "b" })], ROSTER, TODAY);
    expect(rows.map((row) => row.note.id)).toEqual(["b"]);
  });

  test("the backlog excludes an earlier note whose name resolves to one student", () => {
    const rows = backlogRows(
      [note({ id: "a", student_name: "Austin D" }), note({ id: "b" })],
      ROSTER,
      TODAY,
    );
    expect(rows.map((row) => row.note.id)).toEqual(["b"]);
  });

  test("an ambiguous earlier note shows the candidate count", () => {
    const rows = backlogRows([note({ id: "a", student_name: "Ruby" })], ROSTER, TODAY);
    expect(rows).toHaveLength(1);
    const match = rows[0]?.match;
    expect(match?.kind).toBe("ambiguous");
    if (match?.kind !== "ambiguous") return;
    expect(match.candidates).toHaveLength(3);
  });

  test("newest first, by the day and then by the moment", () => {
    const rows = backlogRows(
      [
        note({ id: "old", note_date: "2026-08-20" }),
        note({ id: "newer", note_date: "2026-08-28", created_at: "2026-08-28T09:00:00.000Z" }),
        note({
          id: "earlier same day",
          note_date: "2026-08-28",
          created_at: "2026-08-28T01:00:00.000Z",
        }),
      ],
      ROSTER,
      TODAY,
    );
    expect(rows.map((row) => row.note.id)).toEqual(["newer", "earlier same day", "old"]);
  });

  test("no roster means no judgement, so nothing is listed", () => {
    expect(backlogRows([note({ id: "a" })], null, TODAY)).toEqual([]);
    expect(backlogRows([note({ id: "a" })], [], TODAY)).toEqual([]);
    expect(backlogRows(null, ROSTER, TODAY)).toEqual([]);
  });

  test("it reads no flag the nightly job set", () => {
    const source = readFileSync(new URL("./backlog.ts", import.meta.url), "utf8");
    // The word appears in a comment saying why it is not read. What must
    // not appear is a read of it.
    const code = source.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toContain("no_match");
    expect(code).toContain("matchNote");
  });
});

describe("what a row says", () => {
  test("the backlog renders nothing when the count is zero", () => {
    expect(backlogRows([], ROSTER, TODAY)).toHaveLength(0);
    // The screen draws nothing at all rather than a heading saying none.
    const screen = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    expect(screen).toContain("{backlog.length > 0 ? (");
  });

  test("one line for the strip, and it counts properly", () => {
    expect(backlogLine(1)).toBe("1 earlier note needs a student");
    expect(backlogLine(4)).toBe("4 earlier notes need a student");
  });

  test("the note text is cut rather than shown whole", () => {
    const long = "x".repeat(200);
    expect(shortText(long)).toHaveLength(93);
    expect(shortText(long).endsWith("...")).toBe(true);
    expect(shortText("Short enough.")).toBe("Short enough.");
    expect(shortText(null)).toBe("");
    expect(shortText("  spread   out  ")).toBe("spread out");
  });

  test("it never says a draft or an email will follow", () => {
    const screen = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    const start = screen.indexOf("{backlog.length > 0 ? (");
    const block = screen.slice(start, screen.indexOf('<p className="today-strip">', start));
    expect(block.length).toBeGreaterThan(200);
    for (const word of ["draft", "email", "send", "resend"]) {
      expect(block.toLowerCase()).not.toContain(word);
    }
  });
});

describe("after a match", () => {
  test("matching from the backlog removes the row from the list", () => {
    const notes = [note({ id: "a", student_name: "Ruby" }), note({ id: "b" })];
    expect(backlogRows(notes, ROSTER, TODAY).map((row) => row.note.id)).toEqual(["a", "b"]);
    // What handleMatched does to termNotes.
    const after = notes.map((row) =>
      row.id === "a" ? { ...row, student_id: "2", student_name: "Ruby Bennett" } : row,
    );
    expect(backlogRows(after, ROSTER, TODAY).map((row) => row.note.id)).toEqual(["b"]);
  });

  test("matching from the backlog updates termNotes as well as notes", () => {
    const screen = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    const start = screen.indexOf("function handleMatched(student: PickerStudent)");
    const handler = screen.slice(start, screen.indexOf("\n  const ", start));
    expect(handler).toContain("setNotes(");
    expect(handler).toContain("setTermNotes(");
    // Both set the same two columns.
    expect(handler.split("student_id: String(student.id)").length - 1).toBe(2);
    expect(handler.split("student_name: student.student_name").length - 1).toBe(2);
  });

  test("a note added this session appears in termNotes with its student_id", () => {
    const screen = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    const after = screen.slice(
      screen.indexOf("function afterSaved("),
      screen.indexOf("async function runInsert("),
    );
    // The real value from the row that was written, not a hardcoded null.
    expect(after).toContain("student_id: row.student_id ?? null");
    expect(after).not.toContain("student_id: null,");
  });
});
