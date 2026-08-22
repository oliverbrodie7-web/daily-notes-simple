import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  SORT_OPTIONS,
  findSort,
  orderLabel,
  type SortDirection,
  type SortKey,
} from "../lib/rosterSort";
import { TickIcon } from "./Icons";

type SortMenuProps = {
  sortKey: SortKey;
  direction: SortDirection;
  onChange: (key: SortKey, direction: SortDirection) => void;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// An arrow rather than an icon import: it points down for the default order
// and up for the reversed one, and it is the same glyph on the button and
// beside the sorted column heading.
export function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg
      className="sort-arrow"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {direction === "reversed" ? <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /> : null}
      {direction === "default" ? <path d="M12 5v14M5.5 12.5 12 19l6.5-6.5" /> : null}
    </svg>
  );
}

export function SortMenu({ sortKey, direction, onChange }: SortMenuProps) {
  const active = findSort(sortKey);
  const isDefault = sortKey === "p2" && direction === "default";
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  // Closes on a tap outside and on escape, the way the toolbar menu does.
  // Focus returns to the Sort button, never to the page behind it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    menuRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choose(key: SortKey, next: SortDirection) {
    onChange(key, next);
    close();
  }

  // Tab cycles inside the menu while it is open and never escapes it.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sort-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`sort-button${isDefault ? "" : " is-set"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort by ${active.label}, ${orderLabel(sortKey, direction)}`}
        onClick={() => setOpen(!open)}
      >
        <span className="sort-button-word">Sort</span>
        <span className="sort-button-name">{active.label}</span>
        <SortArrow direction={direction} />
      </button>

      {open ? (
        <>
          <div className="sort-scrim" aria-hidden="true" />
          <div className="sort-menu" role="menu" ref={menuRef} onKeyDown={handleKeyDown}>
            <p className="sort-menu-head">Sort by</p>
            <div className="sort-group">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.key === sortKey}
                  className={`sort-item${option.key === sortKey ? " is-on" : ""}`}
                  onClick={() => choose(option.key, direction)}
                >
                  {option.label}
                  {option.key === sortKey ? (
                    <TickIcon className="sort-item-tick" size={13} />
                  ) : null}
                </button>
              ))}
            </div>

            <p className="sort-menu-head">Order</p>
            <div className="sort-group">
              {(["default", "reversed"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === direction}
                  className={`sort-item${value === direction ? " is-on" : ""}`}
                  onClick={() => choose(sortKey, value)}
                >
                  {orderLabel(sortKey, value)}
                  {value === direction ? <TickIcon className="sort-item-tick" size={13} /> : null}
                </button>
              ))}
            </div>

            {/* Only shown when the menu is a panel, on a phone. */}
            <button type="button" className="sort-cancel" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
