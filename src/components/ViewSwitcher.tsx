import type { NavLabels } from "../lib/navLabels";

export type AppView = "today" | "output" | "parents" | "manager" | "settings" | "templates";

const VIEWS: AppView[] = ["today", "output", "parents", "manager", "settings", "templates"];

type ViewSwitcherProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
  // Manager and Settings share one PIN lock, so their padlocks show and
  // hide together.
  pinLocked: boolean;
  labels: NavLabels;
};

export const PIN_PROTECTED: AppView[] = ["parents", "manager", "settings", "templates"];

export type GlyphProps = {
  size?: number;
};

// The tab bar icons are drawn inline: simple outlined shapes with rounded
// ends, matching the iOS style rather than pulling in an icon library.
function glyphProps({ size = 19 }: GlyphProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
  } as const;
}

export function CalendarGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

export function DocumentGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M7 3.5h6.5L18.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M13.5 3.5V9h5" />
      <path d="M9 13.5h6M9 16.5h6" />
    </svg>
  );
}

export function PeopleGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <circle cx="9" cy="8.2" r="3.1" />
      <path d="M3.6 19.5v-0.7a5.4 5.4 0 0 1 10.8 0v0.7" />
      <circle cx="17" cy="9.2" r="2.5" />
      <path d="M16.2 19.5h4.2v-0.6a4.2 4.2 0 0 0-5.3-4.1" />
    </svg>
  );
}

export function TickGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </svg>
  );
}

export function TemplateGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <rect x="7.5" y="3.5" width="12" height="14" rx="2.5" />
      <path d="M10.5 7.5h6M10.5 10.5h6M10.5 13.5h3.5" />
      <path d="M15.5 20.5H6.5A2 2 0 0 1 4.5 18.5V7.5" />
    </svg>
  );
}

export function CogGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" />
    </svg>
  );
}

export const GLYPHS: Record<AppView, (props: GlyphProps) => ReturnType<typeof CalendarGlyph>> = {
  today: CalendarGlyph,
  output: DocumentGlyph,
  parents: PeopleGlyph,
  manager: TickGlyph,
  settings: CogGlyph,
  templates: TemplateGlyph,
};

// A tiny padlock beside a protected screen's label while it is locked. It
// stays mounted so it can fade in and out, takes the label's colour in
// every state, and collapses to nothing once unlocked.
export function ManagerPadlock({ locked }: { locked: boolean }) {
  return (
    <span className={`view-lock${locked ? "" : " is-hidden"}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
        <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
      </svg>
    </span>
  );
}

// The phone navigation: a floating tab bar of icons above labels, shown
// below 900px only. From there up the rail takes over.
export function ViewSwitcher({ view, onViewChange, pinLocked, labels }: ViewSwitcherProps) {
  return (
    <nav className="view-bar" aria-label="Screens">
      <div className="view-bar-inner">
        {VIEWS.map((key) => {
          const active = key === view;
          const protectedItem = PIN_PROTECTED.includes(key);
          const Glyph = GLYPHS[key];
          const label = labels.screens[key];
          return (
            <button
              key={key}
              type="button"
              className={`view-bar-item${active ? " is-active" : ""}`}
              aria-current={active ? "true" : undefined}
              aria-label={protectedItem ? (pinLocked ? `${label}, locked` : label) : undefined}
              onClick={() => onViewChange(key)}
            >
              <Glyph />
              <span className="bar-item-label">
                {protectedItem ? <ManagerPadlock locked={pinLocked} /> : null}
                <span className="bar-item-name">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
