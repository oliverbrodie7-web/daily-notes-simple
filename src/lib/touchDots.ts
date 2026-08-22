// The touch points cell: a row of dots above a line of text.
//
// There is no per touch point reply link in the data. Touch points come
// from daily_notes, matched to a student by name; replies come from
// parent_emails, matched to a parent by address. Nothing joins one to the
// other, so this counts rather than pairs: of N dots, the first R are
// filled and the rest are hollow.
//
// Replies are counted per parent, and siblings share an address, so the
// reply count is clamped to the number sent. Without that a row could read
// "2 sent, 3 replied", which is nonsense on a single student's row.

export const MAX_DOTS = 5;

export type TouchDot = "filled" | "hollow";

export type TouchDisplay = {
  sent: number;
  replied: number;
  // At most MAX_DOTS, replied ones first so a reply is never hidden.
  dots: TouchDot[];
  // How many sent touch points the cap left off, 0 when none.
  remainder: number;
  // The line under the dots. The count is emphasised in the markup.
  line: string;
  // False when nothing has been sent, which is when the block stops being
  // a button and leaves the keyboard order.
  tappable: boolean;
};

function whole(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function touchDisplay(sentInput: number, repliedInput: number): TouchDisplay {
  const sent = whole(sentInput);
  // A parent's replies belong to the whole family, so more replies than
  // this student's touch points is possible and meaningless here.
  const replied = Math.min(whole(repliedInput), sent);

  const shown = Math.min(sent, MAX_DOTS);
  const filled = Math.min(replied, shown);
  const dots: TouchDot[] = [
    ...Array.from({ length: filled }, () => "filled" as TouchDot),
    ...Array.from({ length: shown - filled }, () => "hollow" as TouchDot),
  ];

  return {
    sent,
    replied,
    dots,
    remainder: sent - shown,
    line: sent === 0 ? "None sent" : `${sent} sent, ${replied === 0 ? "none" : replied} replied`,
    tappable: sent > 0,
  };
}

// The number the line leads with, so the markup can bold it on its own.
export function touchCountWord(display: TouchDisplay): string {
  return display.sent === 0 ? "None" : String(display.sent);
}

// Everything after that number.
export function touchRestOfLine(display: TouchDisplay): string {
  if (display.sent === 0) return " sent";
  return ` sent, ${display.replied === 0 ? "none" : display.replied} replied`;
}
