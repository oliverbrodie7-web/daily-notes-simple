import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import {
  EDIT_EMPTY,
  EDIT_FAILED,
  canEdit,
  prepareEdit,
  saveEdit,
  type EditUpdate,
} from "./noteEdit";

const ROSTER = [
  { id: 1, student_name: "Ruby Ashford", parent_name: "Mrs Ashford" },
  { id: 2, student_name: "Ruby Bennett", parent_name: "Mr Bennett" },
  { id: 3, student_name: "Ruby Calloway", parent_name: "Ms Calloway" },
  { id: 7, student_name: "Austin Dowling", parent_name: "Mrs Dowling" },
];

const FIELDS = { name: "Austin D", note: "Worked well today." };

function screen(result: { error: unknown } | (() => never) = { error: null }) {
  const written: EditUpdate[] = [];
  const update = mock(async (patch: EditUpdate) => {
    written.push(patch);
    if (typeof result === "function") return result();
    return result;
  });
  return { written, update };
}

const SCREEN = readFileSync(new URL("../components/TodayScreen.tsx", import.meta.url), "utf8");

describe("when a note can be edited", () => {
  test("Edit appears on a note that has not been collated", () => {
    expect(canEdit({ collated: false })).toBe(true);
    // The button is rendered behind exactly that test.
    expect(SCREEN).toContain("{canEdit(note) ? (");
    expect(SCREEN).toContain("collated");
  });

  test("Edit does not appear once a note is collated", () => {
    expect(canEdit({ collated: true })).toBe(false);
  });

  test("a note whose collated flag never arrived is treated as editable", () => {
    // Only an explicit true closes the door, so a missing column never
    // silently hides the button.
    expect(canEdit({})).toBe(true);
    expect(canEdit({ collated: null })).toBe(true);
  });

  test("the screen fetches the flag it judges by", () => {
    expect(SCREEN).toContain(
      'const NOTE_COLUMNS = "id, student_id, student_name, note_text, created_at, added_by, collated"',
    );
  });

  test("the backlog offers no Edit at all", () => {
    const start = SCREEN.indexOf("{backlog.length > 0 ? (");
    const block = SCREEN.slice(start, SCREEN.indexOf('<p className="today-strip">', start));
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toContain("startEdit");
    expect(block).not.toContain(">Edit<");
  });
});

describe("saving an edit", () => {
  test("saving writes only student_name and note_text", async () => {
    const { update, written } = screen();
    const outcome = await saveEdit({ update }, FIELDS, null);
    expect(outcome.kind).toBe("saved");
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({
      student_name: "Austin D",
      note_text: "Worked well today.",
    });
    // Nothing else about the row is touched.
    for (const column of ["collated", "no_match", "added_by", "note_date", "draft_created"]) {
      expect(Object.keys(written[0] ?? {})).not.toContain(column);
    }
  });

  test("it writes to the row it was opened on, and nothing else", () => {
    const handler = SCREEN.slice(
      SCREEN.indexOf("async function handleEditSave"),
      SCREEN.indexOf("function handleMatched"),
    );
    expect(handler).toContain('.from("daily_notes").update(patch).eq("id", note.id)');
    expect(handler).not.toContain(".delete(");
    expect(handler).not.toContain(".insert(");
  });

  test("saving updates the row in both notes and termNotes", () => {
    const apply = SCREEN.slice(
      SCREEN.indexOf("function applyEdit("),
      SCREEN.indexOf("async function handleEditSave"),
    );
    expect(apply).toContain("setNotes(");
    expect(apply).toContain("setTermNotes(");
    // One patch, used for both, so the two cannot disagree.
    expect(apply.split("student_name: update.student_name").length - 1).toBe(1);
    expect(apply).toContain("row.id === id ? patch(row) : row");
  });

  test("the fields are trimmed before they are written", async () => {
    const { update, written } = screen();
    await saveEdit({ update }, { name: "  Austin D  ", note: "  Worked well.  " }, null);
    expect(written[0]?.student_name).toBe("Austin D");
    expect(written[0]?.note_text).toBe("Worked well.");
  });

  test("a failed save keeps the fields open with their contents", async () => {
    const { update } = screen({ error: { message: "denied" } });
    const outcome = await saveEdit({ update }, FIELDS, ROSTER);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.message).toBe(EDIT_FAILED);
    // The row stays open: only a saved outcome closes it.
    const handler = SCREEN.slice(
      SCREEN.indexOf("async function handleEditSave"),
      SCREEN.indexOf("function handleMatched"),
    );
    expect(handler).toContain('if (outcome.kind !== "saved") {');
    expect(handler).toContain("setEditMessage(outcome.message)");
    const after = handler.slice(handler.indexOf('outcome.kind !== "saved"'));
    expect(after.slice(0, 140)).not.toContain("setEditingId(null)");
    expect(handler).not.toContain("setEditName(");
  });

  test("a save that throws reads the same as one that returns an error", async () => {
    const { update } = screen(() => {
      throw new Error("network");
    });
    const outcome = await saveEdit({ update }, FIELDS, ROSTER);
    expect(outcome.kind).toBe("failed");
  });
});

describe("what it refuses", () => {
  test("an empty note is refused and nothing is written", async () => {
    const { update, written } = screen();
    const outcome = await saveEdit({ update }, { ...FIELDS, note: "   " }, ROSTER);
    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.message).toBe(EDIT_EMPTY);
    expect(update).toHaveBeenCalledTimes(0);
    expect(written).toEqual([]);
  });

  test("an empty student name is refused and nothing is written", async () => {
    const { update, written } = screen();
    const outcome = await saveEdit({ update }, { ...FIELDS, name: "" }, ROSTER);
    expect(outcome.kind).toBe("refused");
    expect(update).toHaveBeenCalledTimes(0);
    expect(written).toEqual([]);
  });
});

describe("re-checking the name", () => {
  test("renaming to a name that matches one student sets student_id", async () => {
    const { update, written } = screen();
    await saveEdit({ update }, { ...FIELDS, name: "Austin D" }, ROSTER);
    expect(written[0]?.student_id).toBe("7");
  });

  test("renaming to an ambiguous name clears student_id", async () => {
    const { update, written } = screen();
    await saveEdit({ update }, { ...FIELDS, name: "Ruby" }, ROSTER);
    expect("student_id" in (written[0] ?? {})).toBe(true);
    expect(written[0]?.student_id).toBeNull();
  });

  test("renaming to a name nobody matches clears student_id", async () => {
    const { update, written } = screen();
    await saveEdit({ update }, { ...FIELDS, name: "Zebedee Quibble" }, ROSTER);
    expect(written[0]?.student_id).toBeNull();
  });

  test("renaming with no roster loaded leaves student_id alone", async () => {
    for (const roster of [null, []]) {
      const { update, written } = screen();
      await saveEdit({ update }, { ...FIELDS, name: "Ruby" }, roster);
      // Absent, so the column is not in the update at all.
      expect("student_id" in (written[0] ?? {})).toBe(false);
    }
  });

  test("the roster name is not forced on an edit", () => {
    // Unlike the save time prompt. An edit writes what was typed in the
    // field, and only the id follows the roster.
    expect(prepareEdit({ ...FIELDS, name: "Austin D" }, ROSTER)).toEqual({
      kind: "ready",
      update: {
        student_name: "Austin D",
        note_text: "Worked well today.",
        student_id: "7",
      },
    });
  });

  test("it does not open the picker by itself", () => {
    const handler = SCREEN.slice(
      SCREEN.indexOf("async function handleEditSave"),
      SCREEN.indexOf("function handleMatched"),
    );
    expect(handler).not.toContain("setPickingId");
  });
});

describe("one row at a time", () => {
  test("opening Edit on a second row closes the first without saving", () => {
    // One id, so opening another replaces it. Nothing on that path writes.
    const start = SCREEN.slice(
      SCREEN.indexOf("function startEdit(note: TodayNote)"),
      SCREEN.indexOf("function cancelEdit()"),
    );
    expect(start).toContain("setEditingId(note.id)");
    expect(start).toContain("setEditName(note.student_name)");
    expect(start).toContain("setEditNote(note.note_text)");
    expect(start).not.toContain("update(");
    expect(start).not.toContain("supabase");
    expect(SCREEN).toContain("const [editingId, setEditingId] = useState<string | null>(null)");
    // And the editor renders only for that one row.
    expect(SCREEN).toContain("{editingId === note.id ? (");
  });

  test("cancel changes nothing", () => {
    const cancel = SCREEN.slice(
      SCREEN.indexOf("function cancelEdit()"),
      SCREEN.indexOf("function applyEdit("),
    );
    expect(cancel).toContain("setEditingId(null)");
    expect(cancel).toContain("setEditMessage(null)");
    expect(cancel).not.toContain("setNotes");
    expect(cancel).not.toContain("setTermNotes");
    expect(cancel).not.toContain("supabase");
    expect(cancel).not.toContain("update");
  });

  test("Save is disabled while it runs, so it cannot write twice", () => {
    expect(SCREEN).toContain("if (editBusy) return;");
    expect(SCREEN).toContain('{editBusy ? "Saving..." : "Save"}');
    const button = SCREEN.slice(SCREEN.indexOf('className="primary-button note-edit-save"'));
    expect(button.slice(0, 200)).toContain("disabled={editBusy}");
  });
});
