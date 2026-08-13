import { useEffect, useState } from "react";
import type { ThemeMode } from "../hooks/useTheme";
import { formatSydneyHeaderDate } from "../lib/dates";
import { LockIcon, StarIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

type HeaderProps = {
  theme: ThemeMode;
  onSelectTheme: (next: ThemeMode) => void;
  showLock: boolean;
  onLock: () => void;
  onSignOut: () => void;
};

const LOCK_FADE_MS = 150;

export function Header({ theme, onSelectTheme, showLock, onLock, onSignOut }: HeaderProps) {
  // Kept mounted for the length of the fade so it can leave as well as
  // arrive. Reduced motion skips the transition, and the timer simply ends
  // a frame later.
  const [mounted, setMounted] = useState(showLock);

  useEffect(() => {
    if (showLock) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), LOCK_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [showLock]);

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
          <ThemeToggle theme={theme} onSelect={onSelectTheme} />
          {mounted ? (
            <button
              type="button"
              className={`lock-button${showLock ? "" : " is-leaving"}`}
              aria-label="Lock the protected screens"
              title="Lock the protected screens"
              onClick={onLock}
            >
              <LockIcon size={16} />
              <span className="lock-button-word">Lock</span>
            </button>
          ) : null}
          <button type="button" className="signout-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
