import { describe, expect, test } from "bun:test";
import {
  ROSTER_VIEWS,
  ROSTER_VIEW_LABELS,
  ROSTER_VIEW_STORAGE_KEY,
  isRosterView,
  viewForWidth,
  viewToRender,
  type RosterView,
} from "./rosterView";

describe("the three views", () => {
  test("all three are offered, in switcher order", () => {
    expect(ROSTER_VIEWS).toEqual(["table", "cards", "board"]);
  });

  test("each has a word to show", () => {
    for (const view of ROSTER_VIEWS) expect(ROSTER_VIEW_LABELS[view].length).toBeGreaterThan(0);
  });

  test("no option renders nothing", () => {
    for (const view of ROSTER_VIEWS) {
      expect(["table", "board"]).toContain(viewToRender(view));
    }
  });

  test("Cards falls back to the table until it is built", () => {
    expect(viewToRender("cards")).toBe("table");
    expect(viewToRender("table")).toBe("table");
    expect(viewToRender("board")).toBe("board");
  });
});

describe("the choice survives a reload", () => {
  test("a stored choice is recognised and comes back unchanged", () => {
    for (const view of ROSTER_VIEWS) {
      const written = String(view);
      expect(isRosterView(written)).toBe(true);
      // What a reload would do: read the string back and use it.
      const read: RosterView = isRosterView(written) ? written : "table";
      expect(read).toBe(view);
    }
  });

  test("nothing stored, or rubbish stored, falls back to the table", () => {
    expect(isRosterView(null)).toBe(false);
    expect(isRosterView("")).toBe(false);
    expect(isRosterView("kanban")).toBe(false);
    expect(isRosterView("Board")).toBe(false);
  });

  test("the key is its own, and is not the colour scheme or the sidebar", () => {
    expect(ROSTER_VIEW_STORAGE_KEY).toBe("touch-points-roster-view");
    expect(ROSTER_VIEW_STORAGE_KEY).not.toBe("daily-notes-theme");
    expect(ROSTER_VIEW_STORAGE_KEY).not.toBe("touch-points-sidebar");
  });
});

describe("below 900px", () => {
  test("the phone card layout is used whatever was stored", () => {
    for (const view of ROSTER_VIEWS) expect(viewForWidth(view, false)).toBe("table");
  });

  test("the stored choice is honoured once there is room", () => {
    expect(viewForWidth("board", true)).toBe("board");
    expect(viewForWidth("table", true)).toBe("table");
    expect(viewForWidth("cards", true)).toBe("table");
  });

  test("a narrow visit does not lose the choice, only the layout", () => {
    // viewForWidth reports what to draw; the stored view is untouched, so
    // widening the window brings the board straight back.
    const stored: RosterView = "board";
    expect(viewForWidth(stored, false)).toBe("table");
    expect(viewForWidth(stored, true)).toBe("board");
  });
});
