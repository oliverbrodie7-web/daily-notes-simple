// Touch points are read from daily_notes at display time and matched to
// students by name. Nothing is written: they are a parallel track that never
// reaches contact_log, never reaches deriveStatus, and never displaces a
// status badge.

export type TouchPointNote = {
  student_name: string | null;
  note_date: string | null;
  note_text: string | null;
  added_by: string | null;
};

export type TouchPointEntry = {
  date: string | null;
  text: string | null;
  addedBy: string | null;
};

export type TouchPointSummary = {
  count: number;
  latestDate: string | null;
  entries: TouchPointEntry[];
};

// Trim, lowercase, and collapse internal whitespace, the same shape the
// weekly focus uses for parent names.
export function normaliseStudentName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Match only when exactly one active student matches, mirroring the no_match
// convention: a note that matches nobody, or more than one student, is
// recorded against nobody. Never guess.
export function matchTouchPoints<T extends { id: number | string; student_name: string }>(
  notes: TouchPointNote[],
  activeStudents: T[],
): Map<string, TouchPointSummary> {
  const byName = new Map<string, string[]>();
  for (const student of activeStudents) {
    const key = normaliseStudentName(student.student_name);
    if (!key) continue;
    const ids = byName.get(key);
    if (ids) ids.push(String(student.id));
    else byName.set(key, [String(student.id)]);
  }

  const summaries = new Map<string, TouchPointSummary>();
  for (const note of notes) {
    const key = normaliseStudentName(note.student_name);
    if (!key) continue;
    const ids = byName.get(key);
    // Zero matches, or an ambiguous name shared by two enrolled students.
    if (!ids || ids.length !== 1) continue;
    const id = ids[0]!;
    const summary = summaries.get(id) ?? { count: 0, latestDate: null, entries: [] };
    summary.count += 1;
    summary.entries.push({
      date: note.note_date,
      text: note.note_text,
      addedBy: note.added_by,
    });
    if (note.note_date && (!summary.latestDate || note.note_date > summary.latestDate)) {
      summary.latestDate = note.note_date;
    }
    summaries.set(id, summary);
  }

  // Newest first, so the panel reads the way the contact history does.
  for (const summary of summaries.values()) {
    summary.entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  return summaries;
}
