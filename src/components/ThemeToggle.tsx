import type { ThemeMode } from "../hooks/useTheme";
import { MoonIcon, SunIcon } from "./Icons";

type ThemeToggleProps = {
  theme: ThemeMode;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      <span className={`theme-toggle-option${theme === "light" ? " is-active" : ""}`}>
        <SunIcon />
      </span>
      <span className={`theme-toggle-option${theme === "dark" ? " is-active" : ""}`}>
        <MoonIcon />
      </span>
    </button>
  );
}
