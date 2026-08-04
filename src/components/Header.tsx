import type { ThemeMode } from "../hooks/useTheme";
import { formatSydneyHeaderDate } from "../lib/dates";
import { StarIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

type HeaderProps = {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
};

export function Header({ theme, onToggleTheme, onSignOut }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-brand">
          <h1 className="app-title">
            <StarIcon className="app-title-star" size={20} />
            Touch Points
          </h1>
          <p className="app-date">{formatSydneyHeaderDate()}</p>
        </div>
        <div className="app-header-controls">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="signout-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
