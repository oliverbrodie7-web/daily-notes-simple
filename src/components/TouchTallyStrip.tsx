import type { TallyView } from "../lib/tally";

type TouchTallyStripProps = {
  view: TallyView;
};

// A dash rather than a nought while the numbers are still coming, so a slow
// read is never mistaken for a day when nothing was written.
const WAITING = "-";

// The three numbers count notes written. The bar underneath counts students
// reached, which is a different question and the one that matters, so the
// labels say which is which without either needing explaining.
export function TouchTallyStrip({ view }: TouchTallyStripProps) {
  // A failed read shows nothing at all. A wrong number here would be read as
  // a real one, and the rest of the screen works without it.
  if (view.kind === "hidden") return null;

  const ready = view.kind === "ready" ? view : null;
  const number = (value: number | undefined) => (ready ? String(value) : WAITING);
  const reached = ready?.reached;

  return (
    <section className="tally-strip" aria-label="Touch points summary">
      <ul className="tally-units">
        <li className="tally-unit">
          <span className="tally-number is-accent">{number(ready?.tally.today)}</span>
          <span className="tally-label">today</span>
        </li>
        <li className="tally-unit">
          <span className="tally-number is-accent">{number(ready?.tally.week)}</span>
          <span className="tally-label">this week</span>
        </li>
        <li className="tally-unit">
          <span className="tally-number is-good">{number(ready?.tally.term)}</span>
          <span className="tally-label">this term</span>
        </li>
      </ul>

      <div className="tally-bar-head">
        <span className="tally-bar-label">Students reached this term</span>
        <span className="tally-bar-value">
          <span className="tally-bar-percent">{ready ? `${reached?.rate}%` : WAITING}</span>
          {ready ? `, ${reached?.reached} of ${reached?.total}` : null}
        </span>
      </div>
      <div
        className="tally-bar-track"
        role="progressbar"
        aria-label="Students reached this term"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(ready
          ? {
              "aria-valuenow": reached?.rate,
              "aria-valuetext": `${reached?.rate} percent, ${reached?.reached} of ${reached?.total} students reached this term`,
            }
          : {})}
      >
        <div className="tally-bar-fill" style={{ width: `${reached?.rate ?? 0}%` }} />
      </div>
    </section>
  );
}
