import { useCallback, useEffect, useState } from "react";

// A new key of its own. The colour scheme key is not touched.
const SIDEBAR_STORAGE_KEY = "touch-points-sidebar";

// Above this the rail is expanded by default. Between the rail's own
// breakpoint and this one there is room for the icons but not comfortably
// for the labels, so it starts collapsed and can still be expanded.
const WIDE = "(min-width: 1100px)";

function readStored(): boolean | null {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
    return null;
  } catch {
    return null;
  }
}

function initialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  const stored = readStored();
  if (stored !== null) return stored;
  return !window.matchMedia(WIDE).matches;
}

// The stored choice wins and is remembered per device. Until the person
// touches the control, the width decides.
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [chosen, setChosen] = useState(() => {
    if (typeof window === "undefined") return false;
    return readStored() !== null;
  });

  // While nothing has been chosen, crossing the wide breakpoint changes the
  // default. Once the person has chosen, their choice stands at every width.
  useEffect(() => {
    if (chosen || typeof window === "undefined") return;
    const query = window.matchMedia(WIDE);
    const onChange = () => setCollapsed(!query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [chosen]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
      } catch {
        // Private browsing can block storage; the choice stands for now.
      }
      return next;
    });
    setChosen(true);
  }, []);

  return { collapsed, toggleSidebar };
}
