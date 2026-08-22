import type { ThemeMode } from "../hooks/useTheme";
import { formatSydneyHeaderDate } from "../lib/dates";
import { ExitIcon, LockIcon, StarIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";
import { GLYPHS, ManagerPadlock, PIN_PROTECTED, type AppView } from "./ViewSwitcher";

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
};

// The five screens in three groups. The order matches the tab bar, so the
// two navigations never disagree about where a screen sits.
const GROUPS: { heading: string; items: { key: AppView; label: string }[] }[] = [
  {
    heading: "Daily",
    items: [
      { key: "today", label: "Today" },
      { key: "output", label: "Output" },
    ],
  },
  {
    heading: "Follow up",
    items: [
      { key: "parents", label: "Parents" },
      { key: "manager", label: "Manager" },
    ],
  },
  {
    heading: "Setup",
    items: [{ key: "settings", label: "Settings" }],
  },
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
          <div className="sidebar-group" key={group.heading}>
            <p className="sidebar-group-head">{group.heading}</p>
            {group.items.map((item) => {
              const active = item.key === view;
              const protectedItem = PIN_PROTECTED.includes(item.key);
              const Glyph = GLYPHS[item.key];
              const locked = protectedItem && pinLocked;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`sidebar-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={locked ? `${item.label}, locked` : item.label}
                  onClick={() => onViewChange(item.key)}
                >
                  <span className="sidebar-item-icon">
                    <Glyph size={18} />
                  </span>
                  <span className="sidebar-item-label">{item.label}</span>
                  {protectedItem ? <ManagerPadlock locked={pinLocked} /> : null}
                  {/* Only seen while the rail is collapsed. */}
                  <span className="sidebar-tip" aria-hidden="true">
                    {item.label}
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
