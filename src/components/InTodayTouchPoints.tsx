import { useState } from "react";
import type { InTodayChip } from "../lib/inToday";

// The box under the tally strip on Today. It lists the students who come in
// today and still need a touch point, worst wait first. Tapping a chip fills
// the Student Name field and moves to the note, so a tutor can write about the
// child in front of them without retyping the name. The first ten show, with
// the rest behind a control, so a busy day does not bury the form.

const INITIAL_SHOWN = 10;

type InTodayTouchPointsProps = {
  chips: InTodayChip[];
  // Today's weekday long name, for the muted summary line.
  weekday: string;
  // Every active student in today, needing a touch point or not, for the count.
  inTodayCount: number;
  onPick: (fullName: string) => void;
};

export function InTodayTouchPoints({
  chips,
  weekday,
  inTodayCount,
  onPick,
}: InTodayTouchPointsProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? chips : chips.slice(0, INITIAL_SHOWN);
  const counts = `${chips.length} of ${inTodayCount} in`;
  const summary = weekday ? `${weekday} · ${counts}` : counts;

  return (
    <section
      className="in-today"
      aria-label="Students who are in today and still need a touch point"
    >
      <div className="in-today-head">
        <p className="in-today-title">In today, needs a touch point</p>
        <p className="in-today-summary">{summary}</p>
      </div>
      {chips.length === 0 ? (
        <p className="in-today-clear">All caught up for today.</p>
      ) : (
        <>
          <div className="in-today-chips">
            {shown.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="in-today-chip"
                onClick={() => onPick(chip.studentName)}
              >
                <span className="in-today-chip-name">{chip.label}</span>
                {chip.time ? <span className="in-today-chip-time">{chip.time}</span> : null}
              </button>
            ))}
          </div>
          {chips.length > INITIAL_SHOWN ? (
            <button
              type="button"
              className="in-today-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((open) => !open)}
            >
              {showAll ? "Show fewer" : `Show all ${chips.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
