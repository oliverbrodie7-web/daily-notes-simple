import { touchCountWord, touchRestOfLine, type TouchDisplay } from "../lib/touchDots";

// The dots are decorative: whatever holds them carries an aria-label with
// the same wording, so a screen reader hears one sentence rather than a
// list.
//
// The table cell and the board card both draw this, so the two views can
// never show a student's touch points differently.
export function TouchDots({ touch }: { touch: TouchDisplay }) {
  return (
    <>
      {touch.dots.length > 0 ? (
        <span className="touch-dots" aria-hidden="true">
          {touch.dots.map((dot, index) => (
            <span key={index} className={`touch-dot touch-dot-${dot}`} />
          ))}
          {touch.remainder > 0 ? <span className="touch-more">+{touch.remainder}</span> : null}
        </span>
      ) : null}
      <span className={`touch-line${touch.tappable ? "" : " is-empty"}`} aria-hidden="true">
        <span className="touch-line-count">{touchCountWord(touch)}</span>
        {touchRestOfLine(touch)}
      </span>
    </>
  );
}
