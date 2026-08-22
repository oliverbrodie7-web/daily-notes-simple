import { createContext, useContext, type ReactNode } from "react";
import { MenuIcon } from "./Icons";

type SidebarControl = {
  collapsed: boolean;
  onToggle: () => void;
};

// Only the collapse control needs to reach the screens, so this carries that
// and nothing else. Everything a bar shows comes from the screen itself,
// which already holds it, so no screen state is lifted anywhere.
const SidebarControlContext = createContext<SidebarControl | null>(null);

export const SidebarControlProvider = SidebarControlContext.Provider;

type ScreenBarProps = {
  title: string;
  // The small line of context under the title. Settings has none.
  subtitle?: ReactNode;
  // The actions belonging to this screen, shown at the right.
  children?: ReactNode;
};

// The bar belonging to the current screen: its name, a line of context, and
// its own actions. It replaces the app header on a wide screen and takes the
// place of each screen's own heading everywhere.
export function ScreenBar({ title, subtitle, children }: ScreenBarProps) {
  const sidebar = useContext(SidebarControlContext);

  return (
    <div className="screen-bar">
      {sidebar ? (
        <button
          type="button"
          className="screen-bar-toggle"
          aria-label="Show or hide the sidebar"
          title="Show or hide the sidebar"
          aria-expanded={!sidebar.collapsed}
          onClick={sidebar.onToggle}
        >
          <MenuIcon size={18} />
        </button>
      ) : null}
      <div className="screen-bar-main">
        <h2 className="screen-bar-title">{title}</h2>
        {subtitle ? <p className="screen-bar-sub">{subtitle}</p> : null}
      </div>
      {children ? <div className="screen-bar-actions">{children}</div> : null}
    </div>
  );
}
