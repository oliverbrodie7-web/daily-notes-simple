import { useCallback, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "daily-notes-theme";

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
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

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: ThemeMode = current === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private browsing can block storage; the mode still switches for now.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
