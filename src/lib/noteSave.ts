// Deciding what to do with a typed student name, before the note is
// written.
//
// Twenty two percent of the active roster shares a first name with somebody
// else. A note typed as a bare shared first name resolves to nobody, and
// the nightly job cannot resolve it either, so it drafts to a placeholder
// address where it looks finished and reaches no parent. Asking at the
// moment of typing is the only point where the person who knows the answer
// is still sitting there.
//
// Nothing here matches a name itself. It asks matchNote, the same function
// the chips and the bulk preview ask, so a name resolves the same way
// wherever it is read.

import { matchNote, type MatchableStudent } from "./touchPoints";

// The row written to daily_notes. student_id is present only when there is
// one to write, rather than set to null, which is how the bulk upload
// writes it too.
export type NoteRow = {
  student_name: string;
  note_text: string;
  note_date: string;
  collated: false;
  draft_created: false;
  no_match: false;
  added_by: string;
  student_id?: string;
};

export type NoteFields = {
  name: string;
  note: string;
  staff: string;
};

export function noteRow(fields: NoteFields, noteDate: string, studentId: string | null): NoteRow {
  const base: NoteRow = {
    student_name: fields.name,
    note_text: fields.note,
    note_date: noteDate,
    collated: false,
    draft_created: false,
    no_match: false,
    added_by: fields.staff,
  };
  return studentId ? { ...base, student_id: studentId } : base;
}

export type SaveDecision<T> =
  // Save now. studentId is null when there was no roster to ask, and
  // studentName is what to write: the roster's spelling when it resolved
  // the name, and exactly what was typed when it did not.
  | { kind: "save"; studentId: string | null; studentName: string }
  // Ask first. candidates is empty when nobody came close.
  | { kind: "ask"; candidates: T[] };

export function decideSave<T extends MatchableStudent>(
  name: string,
  students: T[] | null,
): SaveDecision<T> {
  // No roster is never a reason to refuse a note. A failed read and an
  // empty roster look the same from here, and both mean carry on: the note
  // is written unmatched, exactly as every note was written before this.
  if (!students || students.length === 0)
    return { kind: "save", studentId: null, studentName: name };
  const found = matchNote({ student_name: name }, students);
  if (found.kind === "matched") {
    // The roster's spelling, not the typed one. A tutor typing "Sydne" for
    // Sydney Warren used to save "Sydne", and the nightly job merges the
    // saved name into the email, so a parent read their child's name
    // misspelled. A resolved name has a correct spelling available and
    // there is no reason to keep the wrong one.
    return {
      kind: "save",
      studentId: String(found.student.id),
      studentName: found.student.student_name,
    };
  }
  return { kind: "ask", candidates: found.kind === "ambiguous" ? found.candidates : [] };
}

// What the note is waiting on while the picker is open. The fields are
// carried rather than read again, so nothing typed after the prompt opens
// can change what gets saved.
export type PendingNote<T> = NoteFields & { candidates: T[] };

export type SaveOutcome<T> =
  { kind: "asked"; pending: PendingNote<T> } | { kind: "saved"; row: NoteRow } | { kind: "failed" };

export type AddNoteDeps<T extends MatchableStudent> = {
  students: T[] | null;
  // The date the note is for, read at the moment of saving.
  noteDate: string;
  insert: (row: NoteRow) => Promise<{ error: unknown }>;
};

// The save itself, once there is nothing left to ask. Both routes into it,
// the one that never asked and the one that has been answered, build the
// row the same way.
export async function saveNote<T extends MatchableStudent>(
  deps: AddNoteDeps<T>,
  fields: NoteFields,
  studentId: string | null,
): Promise<SaveOutcome<T>> {
  const row = noteRow(fields, deps.noteDate, studentId);
  try {
    const { error } = await deps.insert(row);
    if (error) return { kind: "failed" };
    return { kind: "saved", row };
  } catch {
    return { kind: "failed" };
  }
}

export async function addNote<T extends MatchableStudent>(
  deps: AddNoteDeps<T>,
  fields: NoteFields,
): Promise<SaveOutcome<T>> {
  const decision = decideSave(fields.name, deps.students);
  if (decision.kind === "ask") {
    return { kind: "asked", pending: { ...fields, candidates: decision.candidates } };
  }
  return saveNote(deps, { ...fields, name: decision.studentName }, decision.studentId);
}
