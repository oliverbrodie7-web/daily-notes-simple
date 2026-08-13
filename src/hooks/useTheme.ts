import { useCallback, useState } from "react";

export type ThemeMode = "light" | "mist" | "dark";

const THEME_STORAGE_KEY = "daily-notes-theme";

const THEME_MODES: ThemeMode[] = ["light", "mist", "dark"];

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && (THEME_MODES as string[]).includes(value);
}

// The key predates Mist and holds "light" or "dark" on existing devices.
// Both still read correctly; anything unrecognised is treated as no choice
// at all rather than left in a broken state.
function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = readStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The stored choice wins. Until the user taps the switch for the first time,
// the device's own system setting decides the mode.
export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  const selectTheme = useCallback((next: ThemeMode) => {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the mode still switches for now.
    }
  }, []);

  return { theme, selectTheme };
}
