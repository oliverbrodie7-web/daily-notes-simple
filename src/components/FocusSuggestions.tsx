import { shortStudentName, type SuggestableStudent } from "../lib/focus";

type FocusSuggestionsProps = {
  students: SuggestableStudent[];
};

// A quiet nudge, never a task list. The chips are deliberately inert: a
// tappable chip that filled the name field would make it easy to write
// about a child who was not in tonight, which is the one thing this must
// not encourage. Nothing here uses a warning colour or counts what is
// outstanding.
export function FocusSuggestions({ students }: FocusSuggestionsProps) {
  if (students.length === 0) return null;

  return (
    <section
      className="focus-strip"
      aria-label={`Students who have not been written about recently: ${students
        .map((student) => shortStudentName(student.student_name))
        .join(", ")}`}
    >
      <p className="focus-strip-head" aria-hidden="true">
        Not heard from in a while
      </p>
      <div className="focus-strip-chips" aria-hidden="true">
        {students.map((student) => (
          <span key={student.id} className="focus-chip">
            {shortStudentName(student.student_name)}
          </span>
        ))}
      </div>
      <p className="focus-strip-note" aria-hidden="true">
        If any of these are in with you, they would be lovely to write about. No need to force it.
      </p>
    </section>
  );
}
