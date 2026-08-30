import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { UndoToast } from "./UndoToast";
import { UNDO_FAILED, UNDO_SUFFIX } from "../lib/undoToast";

// No DOM here, and adding one would mean a new package. The component is a
// function returning an element tree, so it is called and the tree walked:
// the roles, the labels, the disabled flags and the handlers are real props
// on real elements.

type Element = {
  type: unknown;
  props: Record<string, unknown> & { children?: unknown; className?: string };
};

function flatten(node: unknown, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;
  const element = node as Element;
  if (element.props) {
    found.push(element);
    flatten(element.props.children, found);
  }
  return found;
}

function render(over: Partial<Parameters<typeof UndoToast>[0]> = {}) {
  const onUndo = mock(() => {});
  const onDismiss = mock(() => {});
  const onPause = mock(() => {});
  const onResume = mock(() => {});
  const tree = UndoToast({
    studentName: "Alice Dominguez-Fitzgerald",
    failure: null,
    busy: false,
    onUndo,
    onDismiss,
    onPause,
    onResume,
    ...over,
  }) as ReactElement;
  const all = flatten(tree);
  const byClass = (name: string) => all.find((el) => el.props.className === name);
  return {
    all,
    onUndo,
    onDismiss,
    onPause,
    onResume,
    strip: tree as unknown as Element,
    name: byClass("undo-toast-name"),
    said: byClass("undo-toast-said"),
    button: byClass("undo-toast-button"),
    dismiss: byClass("undo-toast-dismiss"),
    failure: byClass("undo-toast-failure"),
    tick: byClass("undo-toast-tick"),
  };
}

describe("the strip", () => {
  test("the strip renders the student name and stays outside the row list", () => {
    const { strip, name, said } = render();
    expect(name?.props.children).toBe("Alice Dominguez-Fitzgerald");
    expect(said?.props.children).toBe(UNDO_SUFFIX);
    // Its own element, owing nothing to a row: no roster class anywhere in
    // the tree, and it is fixed rather than laid out in the table grid.
    const source = readFileSync(new URL("./UndoToast.tsx", import.meta.url), "utf8");
    for (const rowClass of ["roster-row", "col-actions", "roster-panel", "row-inline-message"]) {
      expect(source).not.toContain(rowClass);
    }
    // And the screen renders it outside the list it belongs to. The
    // newline is what tells the element apart from the type parameter in
    // useState<UndoToastState>.
    const screen = readFileSync(new URL("./TrackerScreen.tsx", import.meta.url), "utf8");
    const listEnd = screen.lastIndexOf("</ul>");
    const usage = screen.indexOf("<UndoToast\n");
    expect(listEnd).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(listEnd);
    expect(strip.props.className).toBe("undo-toast");
  });

  test("it is announced without stealing focus", () => {
    const { strip } = render();
    expect(strip.props.role).toBe("status");
    expect(strip.props["aria-live"]).toBe("polite");
    // Nothing here reaches for focus.
    expect(strip.props.autoFocus).toBeUndefined();
    expect(strip.props.tabIndex).toBeUndefined();
    const source = readFileSync(new URL("./UndoToast.tsx", import.meta.url), "utf8");
    expect(source).not.toContain(".focus()");
    expect(source).not.toContain("useRef");
  });

  test("a pointer or keyboard focus pauses the countdown, and leaving resumes it", () => {
    const { strip, onPause, onResume } = render();
    (strip.props.onPointerEnter as () => void)();
    (strip.props.onFocus as () => void)();
    expect(onPause).toHaveBeenCalledTimes(2);
    (strip.props.onPointerLeave as () => void)();
    (strip.props.onBlur as () => void)();
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  test("it holds no database call of its own", () => {
    const source = readFileSync(new URL("./UndoToast.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("useState");
    expect(source).not.toContain("setTimeout");
  });

  test("the tick is decorative, since the text already says it", () => {
    const { tick } = render();
    expect(tick?.props["aria-hidden"]).toBe("true");
  });
});

describe("the undo button", () => {
  test("it says what it undoes, and is free by default", () => {
    const { button } = render();
    expect(button?.props["aria-label"]).toBe("Undo low risk for Alice Dominguez-Fitzgerald");
    expect(button?.props.disabled).toBe(false);
    expect(button?.props.children).toBe("Undo");
  });

  test("it is disabled and says so while the delete runs", () => {
    const { button } = render({ busy: true });
    expect(button?.props.disabled).toBe(true);
    expect(button?.props.children).toBe("Undoing...");
  });

  test("pressing it asks the screen, and dismisses nothing", () => {
    const { button, onUndo, onDismiss } = render();
    (button?.props.onClick as () => void)();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(0);
  });

  test("a failure shows in the strip and leaves the button usable", () => {
    const { failure, button } = render({ failure: UNDO_FAILED });
    expect(failure?.props.children).toBe(UNDO_FAILED);
    expect(button?.props.disabled).toBe(false);
  });

  test("there is no failure line when nothing has failed", () => {
    expect(render().failure).toBeUndefined();
  });
});

describe("the dismiss cross", () => {
  test("it closes the strip without undoing anything", () => {
    const { dismiss, onDismiss, onUndo } = render();
    (dismiss?.props.onClick as () => void)();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(0);
  });

  test("it is hidden below 900px by the stylesheet, not by the component", () => {
    // Rendered either way; the phone rule takes it out, so there is no
    // width for the component to guess at.
    expect(render().dismiss).toBeDefined();
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
    expect(phone).toContain(".undo-toast-dismiss {\n    display: none;");
  });
});
