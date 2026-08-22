import { describe, expect, it } from "bun:test";
import {
  MAX_DOTS,
  touchCountWord,
  touchDisplay,
  touchRestOfLine,
  type TouchDot,
} from "./touchDots";

const filled = (dots: TouchDot[]) => dots.filter((dot) => dot === "filled").length;
const hollow = (dots: TouchDot[]) => dots.filter((dot) => dot === "hollow").length;

describe("how many dots are shown", () => {
  it("shows one dot per touch point up to the cap", () => {
    for (let sent = 0; sent <= MAX_DOTS; sent++) {
      expect(touchDisplay(sent, 0).dots).toHaveLength(sent);
      expect(touchDisplay(sent, 0).remainder).toBe(0);
    }
  });

  it("never shows more than five, however many were sent", () => {
    for (const sent of [6, 7, 12, 40, 1000]) {
      expect(touchDisplay(sent, 0).dots.length).toBeLessThanOrEqual(MAX_DOTS);
      expect(touchDisplay(sent, 0).dots).toHaveLength(MAX_DOTS);
    }
  });

  it("counts the remainder the cap left off", () => {
    expect(touchDisplay(6, 0).remainder).toBe(1);
    expect(touchDisplay(7, 2).remainder).toBe(2);
    expect(touchDisplay(12, 0).remainder).toBe(7);
    expect(touchDisplay(5, 0).remainder).toBe(0);
    expect(touchDisplay(0, 0).remainder).toBe(0);
  });

  it("always adds up: dots shown plus the remainder is what was sent", () => {
    for (let sent = 0; sent <= 20; sent++) {
      const display = touchDisplay(sent, 2);
      expect(display.dots.length + display.remainder).toBe(sent);
    }
  });
});

describe("which dots are filled", () => {
  it("fills one dot per reply", () => {
    const display = touchDisplay(5, 3);
    expect(filled(display.dots)).toBe(3);
    expect(hollow(display.dots)).toBe(2);
  });

  it("puts the replied ones first, so the cap never hides a reply", () => {
    const display = touchDisplay(9, 3);
    expect(display.dots).toHaveLength(MAX_DOTS);
    expect(filled(display.dots)).toBe(3);
    // The filled ones lead, so nothing replied sits past the cap.
    expect(display.dots.slice(0, 3).every((dot) => dot === "filled")).toBe(true);
  });

  it("keeps every reply visible whenever they fit inside the cap", () => {
    for (let sent = 1; sent <= 20; sent++) {
      for (let replied = 0; replied <= sent; replied++) {
        const display = touchDisplay(sent, replied);
        expect(filled(display.dots)).toBe(Math.min(replied, MAX_DOTS));
      }
    }
  });

  it("shows all five filled when every one of many was replied to", () => {
    const display = touchDisplay(8, 8);
    expect(filled(display.dots)).toBe(MAX_DOTS);
    expect(hollow(display.dots)).toBe(0);
    expect(display.remainder).toBe(3);
  });

  it("leaves every dot hollow when nothing was replied to", () => {
    const display = touchDisplay(4, 0);
    expect(filled(display.dots)).toBe(0);
    expect(hollow(display.dots)).toBe(4);
  });

  it("never fills more dots than were sent, even when a parent replied more", () => {
    // Siblings share a parent address, so the reply count belongs to the
    // family rather than to this one student.
    const display = touchDisplay(2, 5);
    expect(display.replied).toBe(2);
    expect(filled(display.dots)).toBe(2);
    expect(display.line).toBe("2 sent, 2 replied");
  });
});

describe("the line underneath", () => {
  it("reads the count sent and the count replied", () => {
    expect(touchDisplay(5, 3).line).toBe("5 sent, 3 replied");
    expect(touchDisplay(9, 4).line).toBe("9 sent, 4 replied");
  });

  it("says none rather than zero when nothing was replied to", () => {
    expect(touchDisplay(5, 0).line).toBe("5 sent, none replied");
    expect(touchDisplay(1, 0).line).toBe("1 sent, none replied");
  });

  it("stays singular at one reply, never 1 replies", () => {
    expect(touchDisplay(3, 1).line).toBe("3 sent, 1 replied");
    expect(touchDisplay(3, 1).line).not.toContain("replies");
    for (let sent = 1; sent <= 12; sent++) {
      for (let replied = 0; replied <= sent; replied++) {
        expect(touchDisplay(sent, replied).line).not.toContain("replies");
      }
    }
  });

  it("reads None sent when nothing has been sent", () => {
    expect(touchDisplay(0, 0).line).toBe("None sent");
  });

  it("splits into the emphasised count and the rest, matching the line", () => {
    for (const [sent, replied] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [5, 3],
      [9, 4],
    ]) {
      const display = touchDisplay(sent!, replied!);
      expect(touchCountWord(display) + touchRestOfLine(display)).toBe(display.line);
    }
  });
});

describe("a student with nothing sent", () => {
  it("renders no dots at all", () => {
    expect(touchDisplay(0, 0).dots).toEqual([]);
  });

  it("is not tappable, so it stays out of the keyboard order", () => {
    expect(touchDisplay(0, 0).tappable).toBe(false);
    expect(touchDisplay(0, 4).tappable).toBe(false);
  });

  it("is tappable as soon as one has been sent", () => {
    expect(touchDisplay(1, 0).tappable).toBe(true);
  });
});

describe("odd inputs never break it", () => {
  it("treats a negative or fractional count as none", () => {
    for (const bad of [-1, -50, 0.4, Number.NaN]) {
      expect(touchDisplay(bad, 0).dots).toEqual([]);
      expect(touchDisplay(bad, 0).line).toBe("None sent");
      expect(touchDisplay(bad, 0).tappable).toBe(false);
    }
  });

  it("ignores a negative reply count", () => {
    expect(touchDisplay(3, -2).replied).toBe(0);
    expect(touchDisplay(3, -2).line).toBe("3 sent, none replied");
  });

  it("rounds a fractional count down rather than drawing half a dot", () => {
    expect(touchDisplay(3.7, 1.9).dots).toHaveLength(3);
    expect(touchDisplay(3.7, 1.9).replied).toBe(1);
  });
});
