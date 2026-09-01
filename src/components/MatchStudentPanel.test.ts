import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchStudentPanel, type PickerStudent } from "./MatchStudentPanel";

// This one holds state, so it cannot simply be called the way the hook free
// components can. It is rendered for real instead, and the markup read.
// There is no DOM and no new package: react-dom is already a dependency.

const ROSTER: PickerStudent[] = [
  { id: 1, student_name: "Ruby Ashford", parent_name: "Mrs Ashford" },
  { id: 2, student_name: "Ruby Bennett", parent_name: "Mr Bennett" },
];

type Props = Parameters<typeof MatchStudentPanel>[0];

function render(over: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    createElement(MatchStudentPanel, {
      noteId: null,
      typedName: "Ruby",
      candidates: ROSTER,
      students: ROSTER,
      onMatched: () => {},
      onClose: () => {},
      ...over,
    } as Props),
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("the escape hatch", () => {
  test("the bulk upload preview still renders without a Save without a student action", () => {
    // No onSkip supplied, which is how the bulk preview and the Added
    // today picker both call it.
    const html = render();
    expect(html).not.toContain("Save without a student");
    expect(html).toContain("Neither of these, search the full list");
    expect(count(html, 'class="match-search-link"')).toBe(1);
  });

  test("it appears the moment a caller supplies onSkip", () => {
    const html = render({ onSkip: () => {} });
    expect(html).toContain("Save without a student");
    expect(html).toContain("Neither of these, search the full list");
  });

  test("it sits beside the search link, not in place of it", () => {
    expect(count(render({ onSkip: () => {} }), 'class="match-search-link"')).toBe(2);
  });

  test("it is a real button", () => {
    const html = render({ onSkip: () => {} });
    const at = html.indexOf("Save without a student");
    expect(html.slice(0, at)).toContain('type="button"');
    expect(html.slice(at - 120, at)).toContain('class="match-search-link"');
  });
});

describe("what it offers", () => {
  test("the candidates when the name was ambiguous", () => {
    const html = render();
    expect(html).toContain("Ruby Ashford");
    expect(html).toContain("Ruby Bennett");
    expect(count(html, 'class="match-option-name"')).toBe(2);
  });

  test("the nearest names when there were no candidates at all", () => {
    const html = render({ candidates: [], typedName: "Rubi" });
    expect(count(html, 'class="match-option-name"')).toBeGreaterThan(0);
  });

  test("it says what was typed", () => {
    expect(render()).toContain('<span class="match-typed">Ruby</span>');
  });

  test("it is a modal that can be left", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Cancel");
  });
});
