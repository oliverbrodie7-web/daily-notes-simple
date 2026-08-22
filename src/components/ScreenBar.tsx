import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MenuIcon } from "./Icons";

type SidebarControl = {
  collapsed: boolean;
  onToggle: () => void;
};

const SidebarControlContext = createContext<SidebarControl | null>(null);

export const SidebarControlProvider = SidebarControlContext.Provider;

// The bar is rendered once, by the shell, above the screen. Screens send
// their own subtitle and actions into it through a portal rather than
// rendering a bar of their own: putting one inside a screen made it subject
// to that screen's layout, and a grid with named areas auto placed it into
// an implicit row after every named one, which dropped it to the bottom of
// the page.
//
// A portal rather than lifted state on purpose. The action buttons close
// over the screen's live values, so anything that copied them upwards would
// have to list every dependency correctly or fire with stale ones.
type ChromeSlots = {
  subtitle: HTMLElement | null;
  actions: HTMLElement | null;
};

const ChromeContext = createContext<ChromeSlots>({ subtitle: null, actions: null });

export function ScreenSubtitle({ children }: { children?: ReactNode }) {
  const { subtitle } = useContext(ChromeContext);
  if (!subtitle || children === null || children === undefined) return null;
  return createPortal(children, subtitle);
}

export function ScreenActions({ children }: { children?: ReactNode }) {
  const { actions } = useContext(ChromeContext);
  if (!actions || !children) return null;
  return createPortal(children, actions);
}

type ScreenFrameProps = {
  title: string;
  children: ReactNode;
};

// The bar belonging to the current screen: the collapse control at the far
// left, the screen's name and its line of context beside it, and the
// screen's own actions at the right.
export function ScreenFrame({ title, children }: ScreenFrameProps) {
  const sidebar = useContext(SidebarControlContext);
  const [subtitle, setSubtitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);

  return (
    <ChromeContext.Provider value={{ subtitle, actions }}>
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
          <p className="screen-bar-sub" ref={setSubtitle} />
        </div>
        <div className="screen-bar-actions" ref={setActions} />
      </div>
      {children}
    </ChromeContext.Provider>
  );
}
