import { useCallback, useEffect, useState } from "react";
import {
  ROSTER_VIEW_STORAGE_KEY,
  isRosterView,
  viewForWidth,
  type RosterView,
} from "../lib/rosterView";

// The board needs the width the table needs. Below this the phone card
// layout is used whatever was stored, and the switcher is not shown.
const WIDE = "(min-width: 900px)";

function readStored(): RosterView | null {
  try {
    const stored = window.localStorage.getItem(ROSTER_VIEW_STORAGE_KEY);
    return isRosterView(stored) ? stored : null;
  } catch {
    return null;
  }
}

// Remembered per device, in a key of its own. Nothing here touches the
// colour scheme key or the sidebar key.
export function useRosterView() {
  const [view, setView] = useState<RosterView>(() => {
    if (typeof window === "undefined") return "table";
    return readStored() ?? "table";
  });
  const [wide, setWide] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(WIDE).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const chooseView = useCallback((next: RosterView) => {
    setView(next);
    try {
      window.localStorage.setItem(ROSTER_VIEW_STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the choice stands for now.
    }
  }, []);

  // What the switcher shows as chosen, and what actually renders. They
  // differ while Cards is chosen, and on a narrow screen.
  return { view, showing: viewForWidth(view, wide), wide, chooseView };
}
