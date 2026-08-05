export type AppView = "today" | "output" | "manager" | "settings";

const VIEWS: { key: AppView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "output", label: "Output" },
  { key: "manager", label: "Manager" },
  { key: "settings", label: "Settings" },
];

const SEGMENT_GAP_PX = 4;

type ViewSwitcherProps = {
  variant: "tabs" | "bar";
  view: AppView;
  onViewChange: (view: AppView) => void;
};

type GlyphProps = {
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

function CalendarGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

function DocumentGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M7 3.5h6.5L18.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M13.5 3.5V9h5" />
      <path d="M9 13.5h6M9 16.5h6" />
    </svg>
  );
}

function TickGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </svg>
  );
}

function CogGlyph(props: GlyphProps) {
  return (
    <svg {...glyphProps(props)}>
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" />
    </svg>
  );
}

const GLYPHS: Record<AppView, (props: GlyphProps) => ReturnType<typeof CalendarGlyph>> = {
  today: CalendarGlyph,
  output: DocumentGlyph,
  manager: TickGlyph,
  settings: CogGlyph,
};

// One switcher, two iOS style forms. At 900px and above it is a segmented
// control under the header with a raised slab that slides to the selection.
// Below 900px it is a floating tab bar of icons above labels. CSS keeps
// exactly one form visible at a time.
export function ViewSwitcher({ variant, view, onViewChange }: ViewSwitcherProps) {
  const activeIndex = Math.max(
    0,
    VIEWS.findIndex((item) => item.key === view),
  );

  if (variant === "tabs") {
    return (
      <nav className="view-tabs" aria-label="Screens">
        <div className="view-tabs-inner">
          <div className="seg-control">
            <div
              className="seg-slab"
              aria-hidden="true"
              style={{
                transform: `translateX(calc(${activeIndex * 100}% + ${
                  activeIndex * SEGMENT_GAP_PX
                }px))`,
              }}
            />
            {VIEWS.map((item) => {
              const active = item.key === view;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`seg-item${active ? " is-active" : ""}`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onViewChange(item.key)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="view-bar" aria-label="Screens">
      <div className="view-bar-inner">
        {VIEWS.map((item) => {
          const active = item.key === view;
          const Glyph = GLYPHS[item.key];
          return (
            <button
              key={item.key}
              type="button"
              className={`view-bar-item${active ? " is-active" : ""}`}
              aria-current={active ? "true" : undefined}
              onClick={() => onViewChange(item.key)}
            >
              <Glyph />
              <span className="bar-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
