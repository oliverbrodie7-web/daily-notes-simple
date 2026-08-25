// Which way the Parents screen is showing the roster.
//
// A new key of its own. The colour scheme key and the sidebar key are not
// touched.

export type RosterView = "table" | "cards" | "board";

export const ROSTER_VIEW_STORAGE_KEY = "touch-points-roster-view";

export const ROSTER_VIEWS: readonly RosterView[] = ["table", "cards", "board"] as const;

export const ROSTER_VIEW_LABELS: Record<RosterView, string> = {
  table: "Table",
  cards: "Cards",
  board: "Board",
};

export function isRosterView(value: string | null): value is RosterView {
  return value === "table" || value === "cards" || value === "board";
}

// Cards is offered and remembered, but it has not been built yet, so it
// falls back to the table rather than rendering nothing. The moment it
// exists this returns it and nothing else has to change.
export function viewToRender(view: RosterView): Exclude<RosterView, "cards"> {
  return view === "cards" ? "table" : view;
}

// The board is a wide screen layout. Below the breakpoint the phone card
// layout is used whatever was stored, and the switcher is not shown.
export function viewForWidth(view: RosterView, wide: boolean): Exclude<RosterView, "cards"> {
  return wide ? viewToRender(view) : "table";
}
