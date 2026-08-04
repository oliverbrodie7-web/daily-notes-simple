export type AppView = "today" | "output" | "settings";

const VIEWS: { key: AppView; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "output", label: "Output" },
  { key: "settings", label: "Settings" },
];

type ViewSwitcherProps = {
  variant: "tabs" | "bar";
  view: AppView;
  onViewChange: (view: AppView) => void;
};

// One switcher for both layouts. The tabs variant shows at 900px and above,
// directly under the header. The bar variant is fixed to the bottom of the
// screen below 900px. CSS keeps exactly one of them visible at a time.
export function ViewSwitcher({ variant, view, onViewChange }: ViewSwitcherProps) {
  const isTabs = variant === "tabs";
  return (
    <nav className={isTabs ? "view-tabs" : "view-bar"} aria-label="Screens">
      <div className={isTabs ? "view-tabs-inner" : "view-bar-inner"}>
        {VIEWS.map((item) => {
          const active = item.key === view;
          const itemClass = isTabs ? "view-tab" : "view-bar-item";
          return (
            <button
              key={item.key}
              type="button"
              className={`${itemClass}${active ? " is-active" : ""}`}
              aria-current={active ? "true" : undefined}
              onClick={() => onViewChange(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
