import type { ThemeMode } from "../hooks/useTheme";
import { formatSydneyHeaderDate } from "../lib/dates";
import { ExitIcon, LockIcon, StarIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";
import { GLYPHS, ManagerPadlock, PIN_PROTECTED, type AppView } from "./ViewSwitcher";
import type { NavLabels } from "../lib/navLabels";

type SidebarProps = {
  view: AppView;
  onViewChange: (view: AppView) => void;
  pinLocked: boolean;
  collapsed: boolean;
  theme: ThemeMode;
  onSelectTheme: (next: ThemeMode) => void;
  showLock: boolean;
  onLock: () => void;
  onSignOut: () => void;
  labels: NavLabels;
};

// The five screens in three groups. The order matches the tab bar, so the
// two navigations never disagree about where a screen sits.
const GROUPS: { key: "daily" | "followUp" | "setup"; items: AppView[] }[] = [
  { key: "daily", items: ["today", "output"] },
  { key: "followUp", items: ["parents", "manager"] },
  { key: "setup", items: ["settings", "templates"] },
];

// The rail. Shown from the tab bar's breakpoint upwards, where it replaces
// both the header and the segmented control. Below that it is not rendered
// at all and the phone header and tab bar are untouched.
export function Sidebar({
  view,
  onViewChange,
  pinLocked,
  collapsed,
  theme,
  onSelectTheme,
  showLock,
  onLock,
  onSignOut,
  labels,
}: SidebarProps) {
  return (
    <nav className={`app-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Screens">
      <div className="sidebar-brand">
        <StarIcon className="sidebar-star" size={20} />
        <span className="sidebar-brand-text">
          <span className="sidebar-name">Touch Points</span>
          <span className="sidebar-date">{formatSydneyHeaderDate()}</span>
        </span>
      </div>

      <div className="sidebar-groups">
        {GROUPS.map((group) => (
          <div className="sidebar-group" key={group.key}>
            <p className="sidebar-group-head">{labels.groups[group.key]}</p>
            {group.items.map((key) => {
              const active = key === view;
              const protectedItem = PIN_PROTECTED.includes(key);
              const Glyph = GLYPHS[key];
              const locked = protectedItem && pinLocked;
              const label = labels.screens[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`sidebar-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={locked ? `${label}, locked` : label}
                  onClick={() => onViewChange(key)}
                >
                  <span className="sidebar-item-icon">
                    <Glyph size={18} />
                  </span>
                  <span className="sidebar-item-label">{label}</span>
                  {protectedItem ? <ManagerPadlock locked={pinLocked} /> : null}
                  {/* Only seen while the rail is collapsed. */}
                  <span className="sidebar-tip" aria-hidden="true">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <ThemeToggle theme={theme} onSelect={onSelectTheme} />
        {showLock ? (
          <button
            type="button"
            className="sidebar-item sidebar-action"
            aria-label="Lock the protected screens"
            onClick={onLock}
          >
            <span className="sidebar-item-icon">
              <LockIcon size={18} />
            </span>
            <span className="sidebar-item-label">Lock</span>
            <span className="sidebar-tip" aria-hidden="true">
              Lock
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="sidebar-item sidebar-action"
          aria-label="Sign out"
          onClick={onSignOut}
        >
          <span className="sidebar-item-icon">
            <ExitIcon size={18} />
          </span>
          <span className="sidebar-item-label">Sign out</span>
          <span className="sidebar-tip" aria-hidden="true">
            Sign out
          </span>
        </button>
      </div>
    </nav>
  );
}
