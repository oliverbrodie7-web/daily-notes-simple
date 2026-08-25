import { ROSTER_VIEWS, ROSTER_VIEW_LABELS, type RosterView } from "../lib/rosterView";

// The same iOS style control the screen switcher used before the rail
// replaced it: a tinted track, a raised slab under the chosen one, and the
// slab slides. The slide lives in the opt in motion block in styles.css, so
// reduced motion gets the move with no animation rather than no move.

// Matches the gap in .roster-view-control, so the slab lands under its item.
const GAP_PX = 4;

// Drawn inline in the same outlined style as the rail's icons, rather than
// pulling in an icon set for three shapes.
const glyph = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

function TableGlyph() {
  return (
    <svg {...glyph}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.5 10h17M9.5 10v9" />
    </svg>
  );
}

function CardsGlyph() {
  return (
    <svg {...glyph}>
      <rect x="3.5" y="4.5" width="17" height="6" rx="2" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="2" />
    </svg>
  );
}

function BoardGlyph() {
  return (
    <svg {...glyph}>
      <rect x="3.5" y="4.5" width="5" height="15" rx="1.8" />
      <rect x="11" y="4.5" width="5" height="10" rx="1.8" />
      <rect x="17.5" y="4.5" width="3" height="15" rx="1.5" />
    </svg>
  );
}

const GLYPHS: Record<RosterView, () => ReturnType<typeof TableGlyph>> = {
  table: TableGlyph,
  cards: CardsGlyph,
  board: BoardGlyph,
};

type RosterViewSwitcherProps = {
  view: RosterView;
  onChange: (view: RosterView) => void;
};

export function RosterViewSwitcher({ view, onChange }: RosterViewSwitcherProps) {
  const index = Math.max(0, ROSTER_VIEWS.indexOf(view));
  return (
    <div className="roster-view-control" role="group" aria-label="How to show the roster">
      <span
        className="roster-view-slab"
        aria-hidden="true"
        style={{ transform: `translateX(calc(${index * 100}% + ${index * GAP_PX}px))` }}
      />
      {ROSTER_VIEWS.map((option) => {
        const Glyph = GLYPHS[option];
        const active = option === view;
        return (
          <button
            key={option}
            type="button"
            className={`roster-view-item${active ? " is-active" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            <Glyph />
            {ROSTER_VIEW_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
