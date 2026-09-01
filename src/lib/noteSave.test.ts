import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import {
  addNote,
  decideSave,
  noteRow,
  saveNote,
  type NoteFields,
  type NoteRow,
  type PendingNote,
} from "./noteSave";

const TODAY = "2026-08-30";

// Three Rubys and three Imogens, which is the shape of the real roster.
const ROSTER = [
  { id: 1, student_name: "Ruby Ashford", parent_name: "Mrs Ashford" },
  { id: 2, student_name: "Ruby Bennett", parent_name: "Mr Bennett" },
  { id: 3, student_name: "Ruby Calloway", parent_name: "Ms Calloway" },
  { id: 4, student_name: "Imogen Patel", parent_name: "Mrs Patel" },
  { id: 5, student_name: "Imogen Quinn", parent_name: "Mr Quinn" },
  { id: 6, student_name: "Imogen Rossi", parent_name: "Ms Rossi" },
  { id: 7, student_name: "Austin Dowling", parent_name: "Mrs Dowling" },
  { id: 8, student_name: "Sydney Warren", parent_name: "Mr Warren" },
];

const FIELDS: NoteFields = { name: "Austin D", note: "Worked well today.", staff: "Claire" };

// A stand in for the screen: the three fields, and the rows that reached
// the database.
function screen(result: { error: unknown } | (() => never) = { error: null }) {
  const written: NoteRow[] = [];
  const insert = mock(async (row: NoteRow) => {
    written.push(row);
    if (typeof result === "function") return result();
    return result;
  });
  return { written, insert };
}

describe("a name that resolves to one student", () => {
  test("a name matching one student saves without a prompt", async () => {
    const { insert, written } = screen();
    const outcome = await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(outcome.kind).toBe("saved");
    expect(written).toHaveLength(1);
  });

  test("a name matching one student now saves with student_id set", async () => {
    const { insert, written } = screen();
    await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(written[0]?.student_id).toBe("7");
  });

  test("a matched note now saves the roster name, not the typed one", async () => {
    // Reversed on purpose. The nightly job merges the saved name into the
    // email, so a shorthand or a misspelling reached the parent as the
    // child's name.
    const { insert, written } = screen();
    await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(written[0]?.student_name).toBe("Austin Dowling");
    expect(written[0]?.student_name).not.toBe("Austin D");
  });

  test("a shorthand saves as Sydney Warren when the roster resolves it", async () => {
    // "Sydney W" is a form matchNote resolves. It used to be saved as
    // written, and the nightly job merges that into the email.
    const { insert, written } = screen();
    await addNote({ students: ROSTER, noteDate: TODAY, insert }, { ...FIELDS, name: "Sydney W" });
    expect(written[0]?.student_name).toBe("Sydney Warren");
    expect(written[0]?.student_id).toBe("8");
  });

  test("Sydne is not resolved by the roster, so it asks rather than saving", async () => {
    // Worth pinning: a truncation is not one of the four things matchNote
    // accepts, so the misspelling never reaches the database at all. The
    // prompt catches this one, not the roster name rule.
    const { insert, written } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Sydne" },
    );
    expect(outcome.kind).toBe("asked");
    expect(written).toEqual([]);
  });

  test("the rest of the row is exactly what it always was", async () => {
    const { insert, written } = screen();
    await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(written[0]).toEqual({
      student_name: "Austin Dowling",
      note_text: "Worked well today.",
      note_date: TODAY,
      collated: false,
      draft_created: false,
      no_match: false,
      added_by: "Claire",
      student_id: "7",
    });
  });
});

describe("a name that does not resolve", () => {
  test("a name matching three students opens the picker before saving", async () => {
    const { insert } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
    );
    expect(outcome.kind).toBe("asked");
    if (outcome.kind !== "asked") return;
    expect(outcome.pending.candidates).toHaveLength(3);
    expect(outcome.pending.candidates.map((student) => student.student_name)).toEqual([
      "Ruby Ashford",
      "Ruby Bennett",
      "Ruby Calloway",
    ]);
  });

  test("nothing is written to daily_notes until a student is chosen", async () => {
    const { insert, written } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
    );
    expect(outcome.kind).toBe("asked");
    expect(insert).toHaveBeenCalledTimes(0);
    expect(written).toEqual([]);
  });

  test("an unrecognised name opens the picker with no candidates", async () => {
    const { insert, written } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Zebedee Quibble" },
    );
    expect(outcome.kind).toBe("asked");
    if (outcome.kind !== "asked") return;
    expect(outcome.pending.candidates).toEqual([]);
    expect(written).toEqual([]);
  });

  test("the pending note carries the fields as they were, not as they are now", async () => {
    const { insert } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
    );
    if (outcome.kind !== "asked") return;
    const pending: PendingNote<(typeof ROSTER)[number]> = outcome.pending;
    expect(pending.note).toBe("Worked well today.");
    expect(pending.staff).toBe("Claire");
    expect(pending.name).toBe("Ruby");
  });
});

describe("answering the picker", () => {
  test("choosing a student saves with that student's id and name", async () => {
    const { insert, written } = screen();
    const chosen = ROSTER[1]!;
    const outcome = await saveNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: chosen.student_name },
      String(chosen.id),
    );
    expect(outcome.kind).toBe("saved");
    expect(written).toHaveLength(1);
    expect(written[0]?.student_id).toBe("2");
    expect(written[0]?.student_name).toBe("Ruby Bennett");
  });

  test("an unmatched save still keeps exactly what was typed", async () => {
    // Nothing better to use. The roster resolved nothing, so the typed name
    // is the only name there is.
    const { insert, written } = screen();
    await saveNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Sydne" },
      null,
    );
    expect(written[0]?.student_name).toBe("Sydne");
    const off = screen();
    await addNote(
      { students: null, noteDate: TODAY, insert: off.insert },
      { ...FIELDS, name: "Sydne" },
    );
    expect(off.written[0]?.student_name).toBe("Sydne");
  });

  test("Save without a student saves with the typed name and no student_id", async () => {
    const { insert, written } = screen();
    const outcome = await saveNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
      null,
    );
    expect(outcome.kind).toBe("saved");
    expect(written[0]?.student_name).toBe("Ruby");
    // Absent, not null, which is how the bulk upload writes it too.
    expect("student_id" in (written[0] ?? {})).toBe(false);
  });

  test("closing the picker saves nothing and keeps the three fields", async () => {
    // Closing calls neither save. The pending note is simply dropped, and
    // the fields it was carrying were never taken off the screen.
    const { insert, written } = screen();
    const outcome = await addNote(
      { students: ROSTER, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
    );
    expect(outcome.kind).toBe("asked");
    if (outcome.kind !== "asked") return;
    // What the screen would still be holding.
    expect(outcome.pending.name).toBe("Ruby");
    expect(outcome.pending.note).toBe("Worked well today.");
    expect(outcome.pending.staff).toBe("Claire");
    expect(written).toEqual([]);
    const source = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    // The close handler clears the prompt and frees the button, and writes
    // nothing.
    const close = source.slice(
      source.indexOf("onClose={() => {\n            setPendingNote(null)"),
    );
    expect(close.slice(0, 200)).toContain("setSaving(false)");
    expect(close.slice(0, 200)).not.toContain("runSave");
    // And nothing clears the fields on that path.
    expect(close.slice(0, 200)).not.toContain("setStudentName");
  });
});

describe("no roster to ask", () => {
  test("a null roster saves immediately with no prompt and no student_id", async () => {
    const { insert, written } = screen();
    const outcome = await addNote({ students: null, noteDate: TODAY, insert }, FIELDS);
    expect(outcome.kind).toBe("saved");
    expect(written).toHaveLength(1);
    expect("student_id" in (written[0] ?? {})).toBe(false);
  });

  test("an empty roster saves immediately with no prompt", async () => {
    const { insert, written } = screen();
    const outcome = await addNote({ students: [], noteDate: TODAY, insert }, FIELDS);
    expect(outcome.kind).toBe("saved");
    expect(written).toHaveLength(1);
    expect("student_id" in (written[0] ?? {})).toBe(false);
  });

  test("a name nobody could resolve still saves when there is no roster", async () => {
    const { insert, written } = screen();
    const outcome = await addNote(
      { students: null, noteDate: TODAY, insert },
      { ...FIELDS, name: "Ruby" },
    );
    expect(outcome.kind).toBe("saved");
    expect(written[0]?.student_name).toBe("Ruby");
  });

  test("the decision says so on its own", () => {
    expect(decideSave("Ruby", null)).toEqual({
      kind: "save",
      studentId: null,
      studentName: "Ruby",
    });
    expect(decideSave("Ruby", [])).toEqual({
      kind: "save",
      studentId: null,
      studentName: "Ruby",
    });
  });
});

describe("the button behind the prompt", () => {
  test("Add note cannot be pressed while the picker is open", () => {
    const source = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");
    // saving is set before the roster is asked and is never cleared on the
    // asked branch, so the button stays disabled behind the prompt.
    const handler = source.slice(
      source.indexOf("async function handleAdd()"),
      source.indexOf("function handleNameKeyDown"),
    );
    expect(handler).toContain("if (saving) return;");
    expect(handler).toContain("setSaving(true);");
    const asked = handler.slice(handler.indexOf('outcome.kind === "asked"'));
    expect(asked.slice(0, 260)).toContain("setPendingNote(outcome.pending)");
    expect(asked.slice(0, 260)).not.toContain("setSaving(false)");
    expect(source).toContain("disabled={saving}");
  });

  test("a failed insert reports it and does not clear the fields", async () => {
    const { insert } = screen({ error: { message: "denied" } });
    const outcome = await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(outcome.kind).toBe("failed");
  });

  test("an insert that throws reads the same as one that returns an error", async () => {
    const { insert } = screen(() => {
      throw new Error("network");
    });
    const outcome = await addNote({ students: ROSTER, noteDate: TODAY, insert }, FIELDS);
    expect(outcome.kind).toBe("failed");
  });
});

describe("the row builder", () => {
  test("omits student_id rather than setting it null", () => {
    expect(noteRow(FIELDS, TODAY, null)).not.toHaveProperty("student_id");
    expect(noteRow(FIELDS, TODAY, "7").student_id).toBe("7");
  });

  test("the date comes in rather than being read here", () => {
    expect(noteRow(FIELDS, "2026-01-01", null).note_date).toBe("2026-01-01");
  });
});
