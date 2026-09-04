// Editing a note that has already been saved.
//
// Only before the nightly job has collated it. Once it has, the Gmail
// draft exists and changing this row changes nothing a parent will see, so
// the screen offers no way in at all rather than an edit that quietly does
// nothing.
//
// A rename re-asks the roster, through matchNote, the same function the
// chips and the save time prompt ask. That matters in both directions: a
// name that now resolves gains an id, and a name that no longer resolves
// loses the one it had, so an id from a previous name cannot survive a
// rename and send the note to the wrong family.

import { matchNote, type MatchableStudent } from "./touchPoints";

export type EditFields = {
  name: string;
  note: string;
};

// Exactly what is written. student_id is present only when the roster had
// something to say; with no roster it is left out entirely and whatever the
// row already carries stands.
export type EditUpdate = {
  student_name: string;
  note_text: string;
  student_id?: string | null;
};

export const EDIT_EMPTY = "Add a student name and a note.";
export const EDIT_FAILED = "The note could not be saved. Please try again.";

// The nightly job has not been near it yet.
export function canEdit(note: { collated?: boolean | null }): boolean {
  return note.collated !== true;
}

export type EditOutcome =
  { kind: "refused"; message: string } | { kind: "ready"; update: EditUpdate };

export function prepareEdit<T extends MatchableStudent>(
  fields: EditFields,
  students: T[] | null,
): EditOutcome {
  const name = fields.name.trim();
  const note = fields.note.trim();
  if (!name || !note) return { kind: "refused", message: EDIT_EMPTY };
  const update: EditUpdate = { student_name: name, note_text: note };
  // No roster is never a reason to refuse an edit, and never a reason to
  // change who the note belongs to.
  if (!students || students.length === 0) return { kind: "ready", update };
  const found = matchNote({ student_name: name }, students);
  if (found.kind === "matched") {
    return { kind: "ready", update: { ...update, student_id: String(found.student.id) } };
  }
  // Cleared rather than left. The row's own chip then says so, and its own
  // button offers the picker.
  return { kind: "ready", update: { ...update, student_id: null } };
}

export type SaveEditDeps = {
  update: (patch: EditUpdate) => Promise<{ error: unknown }>;
};

export type SaveEditOutcome =
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "saved"; update: EditUpdate };

export async function saveEdit<T extends MatchableStudent>(
  deps: SaveEditDeps,
  fields: EditFields,
  students: T[] | null,
): Promise<SaveEditOutcome> {
  const prepared = prepareEdit(fields, students);
  if (prepared.kind === "refused") return prepared;
  try {
    const { error } = await deps.update(prepared.update);
    if (error) return { kind: "failed", message: EDIT_FAILED };
    return { kind: "saved", update: prepared.update };
  } catch {
    return { kind: "failed", message: EDIT_FAILED };
  }
}
