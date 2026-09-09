import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";
import {
  COPY_DEFAULT,
  COPY_IDLE,
  COPY_OPTIONS,
  COPY_REVERT_MS,
  copyLabel,
  copyMenuTitle,
  runCopy,
  type CopyFormat,
  type CopyState,
  type CopyStudent,
} from "../lib/rosterCopy";
import { ChevronDownIcon, CopyIcon, TickIcon } from "./Icons";

// Copy whatever the roster is showing right now.
//
// It is handed the array the views render from, so it cannot disagree with
// what is on screen: a tile filter or a search narrows this the same way it
// narrows the list. The button itself is the confirmation, so there is
// nothing to dismiss afterwards.

type RosterCopyButtonProps = {
  // The filtered, searched, sorted students, in the order shown.
  students: CopyStudent[];
};

export function RosterCopyButton({ students }: RosterCopyButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CopyState>(COPY_IDLE);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Its own open flag and its own ref, so this and the per row dots menus
  // cannot close one another.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The confirmation stands for a moment and then the button goes back to
  // itself. Cleared on unmount, and whenever it is replaced, so a stale
  // timer cannot wipe a newer answer.
  useEffect(() => {
    if (state.kind === "idle") return;
    const handle = window.setTimeout(() => setState(COPY_IDLE), COPY_REVERT_MS);
    return () => window.clearTimeout(handle);
  }, [state]);

  async function handleCopy(format: CopyFormat) {
    setOpen(false);
    setState(await runCopy({ copy: copyText }, students, format));
  }

  const tone = state.kind === "copied" ? " is-copied" : state.kind === "failed" ? " is-failed" : "";

  return (
    <div className={`roster-copy-wrap${tone}`} ref={wrapRef}>
      {/* The same split control the roster rows use, in the secondary
          colours: this sits beside a count, it is not the main thing on
          the row. */}
      <div className="row-log-split roster-copy">
        <button
          type="button"
          className="row-log-main"
          aria-label={`Copy the names of the ${students.length} students shown`}
          onClick={() => void handleCopy(COPY_DEFAULT)}
        >
          {state.kind === "copied" ? <TickIcon size={14} /> : <CopyIcon size={15} />}
          {copyLabel(state)}
        </button>
        <button
          type="button"
          className="row-log-arrow"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Choose what to copy"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDownIcon size={15} />
        </button>
      </div>
      {open ? (
        <div className="action-menu roster-copy-menu" role="menu" aria-label="Copy these students">
          <p className="roster-copy-menu-title">{copyMenuTitle(students.length)}</p>
          {COPY_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              className="action-menu-item roster-copy-item"
              onClick={() => void handleCopy(option.key)}
            >
              <span className="roster-copy-item-label">{option.label}</span>
              <span className="roster-copy-item-hint">{option.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
