import type { ThemeMode } from "../hooks/useTheme";
import { DropletIcon, MoonIcon, SunIcon } from "./Icons";

type ThemeToggleProps = {
  theme: ThemeMode;
  onSelect: (next: ThemeMode) => void;
};

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof SunIcon }[] = [
  { mode: "light", label: "Bright", Icon: SunIcon },
  { mode: "mist", label: "Mist", Icon: DropletIcon },
  { mode: "dark", label: "Dark", Icon: MoonIcon },
];

// Three real buttons in one pill, so each colour scheme is reachable in a
// single tap and by keyboard.
export function ThemeToggle({ theme, onSelect }: ThemeToggleProps) {
  return (
    <div className="theme-toggle" role="group" aria-label="Colour scheme">
      {OPTIONS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          className={`theme-toggle-option${theme === mode ? " is-active" : ""}`}
          aria-label={label}
          aria-pressed={theme === mode}
          title={label}
          onClick={() => onSelect(mode)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
