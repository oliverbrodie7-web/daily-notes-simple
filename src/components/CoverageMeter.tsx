import {
  COVERAGE_CAPTION,
  COVERAGE_FINISH,
  COVERAGE_HEADLINE_LABEL,
  COVERAGE_LEGEND,
  coveragePaceLine,
  type CoverageCounts,
  type CoverageGroup,
} from "../lib/coverage";

// The coverage meter: one headline, one stacked bar, one legend. No hooks of
// its own, so each piece can be rendered and read on its own. It reports the
// numbers it is handed and, when a segment or legend row is tapped, asks the
// screen to filter the table to that group.

type CoverageMeterProps = {
  counts: CoverageCounts;
  // Teaching weeks left in the term, for the pace line. Zero when the term
  // has ended or none is set, which drops the pace.
  weeksLeft: number;
  // The coverage group the list is filtered to, if any.
  activeGroup: CoverageGroup | null;
  onSelect: (group: CoverageGroup) => void;
};

function countFor(counts: CoverageCounts, group: CoverageGroup): number {
  if (group === "green") return counts.green;
  if (group === "teal") return counts.teal;
  return counts.red;
}

export function CoverageMeter({ counts, weeksLeft, activeGroup, onSelect }: CoverageMeterProps) {
  const total = counts.total;
  // Nobody left to contact: the headline becomes the finish line and the
  // pace drops away. The red segment is already zero, so the bar is left
  // showing green and teal alone.
  const finished = counts.red === 0;
  return (
    <section className="coverage-meter" aria-label="Touch point coverage this term">
      {finished ? (
        <div className="coverage-headline coverage-headline-done">
          <p className="coverage-finish">{COVERAGE_FINISH}</p>
        </div>
      ) : (
        <>
          {/* The headline is the one number that is your job: families with no
              touch point yet. */}
          <div className="coverage-headline">
            <span className="coverage-headline-number">{counts.red}</span>
            <span className="coverage-headline-text">
              <span className="coverage-headline-label">{COVERAGE_HEADLINE_LABEL}</span>
              <span className="coverage-caption">{COVERAGE_CAPTION}</span>
            </span>
          </div>
          <p className="coverage-pace">{coveragePaceLine(counts.red, weeksLeft)}</p>
        </>
      )}

      {/* Green, then teal, then red, each segment as wide as its share and
          each showing its count. */}
      <div className="coverage-bar" role="group" aria-label="Coverage breakdown">
        {COVERAGE_LEGEND.map((item) => {
          const value = countFor(counts, item.group);
          const active = activeGroup === item.group;
          return (
            <button
              key={item.group}
              type="button"
              className={`coverage-seg coverage-seg-${item.group}${active ? " is-active" : ""}`}
              style={{ flexGrow: value, flexBasis: 0 }}
              aria-pressed={active}
              aria-label={`${item.label}, ${value} of ${total}`}
              onClick={() => onSelect(item.group)}
              hidden={value === 0}
            >
              <span className="coverage-seg-count">{value}</span>
            </button>
          );
        })}
      </div>

      {/* Has a P2 (parent booked), Touch point sent (you caught them), Needs a
          touch point (your job). */}
      <ul className="coverage-legend">
        {COVERAGE_LEGEND.map((item) => {
          const value = countFor(counts, item.group);
          const active = activeGroup === item.group;
          return (
            <li key={item.group}>
              <button
                type="button"
                className={`coverage-legend-item coverage-legend-${item.group}${
                  active ? " is-active" : ""
                }`}
                aria-pressed={active}
                onClick={() => onSelect(item.group)}
              >
                <span className="coverage-dot" aria-hidden="true" />
                <span className="coverage-legend-label">{item.label}</span>
                <span className="coverage-legend-note">{item.note}</span>
                <span className="coverage-legend-count">{value}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
