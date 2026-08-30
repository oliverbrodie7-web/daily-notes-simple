import { describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { RowLogSplit } from "./RowLogSplit";
import { LOW_RISK_BLOCKED_TITLE, lowRiskBlocked } from "../lib/lowRisk";

// No DOM here, and adding one would mean a new package. The component is a
// function returning an element tree, so it is called and the tree walked:
// the disabled flags, the labels and the click handlers are all real props
// on real elements, not a description of them.

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

function render(over: Partial<Parameters<typeof RowLogSplit>[0]> = {}) {
  const onLowRisk = mock(() => {});
  const onOpenPanel = mock(() => {});
  const tree = RowLogSplit({
    studentName: "Alice Dominguez",
    blocked: false,
    busy: false,
    onLowRisk,
    onOpenPanel,
    ...over,
  }) as ReactElement;
  const all = flatten(tree);
  const byClass = (name: string) => all.find((el) => el.props.className === name);
  return {
    onLowRisk,
    onOpenPanel,
    main: byClass("row-log-main"),
    arrow: byClass("row-log-arrow"),
    wrapper: byClass("row-log-split"),
  };
}

describe("the split control", () => {
  test("it is one control holding two buttons", () => {
    const { wrapper, main, arrow } = render();
    expect(wrapper).toBeDefined();
    expect(main?.type).toBe("button");
    expect(arrow?.type).toBe("button");
    expect(main?.props.type).toBe("button");
    expect(arrow?.props.type).toBe("button");
  });

  test("the two halves say what they are", () => {
    const { main, arrow } = render();
    expect(main?.props["aria-label"]).toBe("Log low risk parent for Alice Dominguez");
    expect(arrow?.props["aria-label"]).toBe("More logging options for Alice Dominguez");
  });

  test("the main half reads Low risk, after an icon", () => {
    const { main } = render();
    const children = main?.props.children as unknown[];
    const words = children.filter((child) => typeof child === "string").join("");
    expect(words).toBe("Low risk");
    // The icon comes first, so the words are not the whole of it.
    expect(children.some((child) => typeof child === "object" && child !== null)).toBe(true);
  });
});

describe("disabled", () => {
  test("the main button is disabled when derived status is p2_complete", () => {
    const { main } = render({ blocked: lowRiskBlocked("p2_complete") });
    expect(main?.props.disabled).toBe(true);
  });

  test("the arrow is still enabled when the main button is disabled", () => {
    const { main, arrow } = render({ blocked: lowRiskBlocked("p2_complete") });
    expect(main?.props.disabled).toBe(true);
    // Not merely falsy: the arrow carries no disabled prop at all.
    expect(arrow?.props.disabled).toBeUndefined();
  });

  test("the arrow is still enabled while a write is in flight", () => {
    const { main, arrow } = render({ busy: true });
    expect(main?.props.disabled).toBe(true);
    expect(arrow?.props.disabled).toBeUndefined();
  });

  test("neither is disabled on an ordinary row", () => {
    const { main, arrow } = render();
    expect(main?.props.disabled).toBe(false);
    expect(arrow?.props.disabled).toBeUndefined();
  });

  test("the disabled main button explains itself, and an enabled one carries no title", () => {
    expect(render({ blocked: true }).main?.props.title).toBe(LOW_RISK_BLOCKED_TITLE);
    expect(render().main?.props.title).toBeUndefined();
    // Busy is not the same as refused, so it gets no explanation.
    expect(render({ busy: true }).main?.props.title).toBeUndefined();
  });
});

describe("what the halves do", () => {
  test("the arrow calls openPanel with log and the student id", () => {
    // Wired the way the row wires it, so the arrow opens the panel the
    // whole button used to open rather than a menu of its own.
    const openPanel = mock((_kind: string, _studentId: number | string) => {});
    const { arrow } = render({ onOpenPanel: () => openPanel("log", 7) });
    (arrow?.props.onClick as () => void)();
    expect(openPanel).toHaveBeenCalledTimes(1);
    expect(openPanel.mock.calls[0]).toEqual(["log", 7]);
  });

  test("the arrow opens nothing else: it has no menu of its own", () => {
    const { arrow } = render();
    expect(arrow?.props["aria-haspopup"]).toBeUndefined();
    expect(arrow?.props["aria-expanded"]).toBeUndefined();
  });

  test("the main half calls the one tap write, and only it", () => {
    const { main, onLowRisk, onOpenPanel } = render();
    (main?.props.onClick as () => void)();
    expect(onLowRisk).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).toHaveBeenCalledTimes(0);
  });

  test("the arrow does not write", () => {
    const { arrow, onLowRisk, onOpenPanel } = render();
    (arrow?.props.onClick as () => void)();
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(onLowRisk).toHaveBeenCalledTimes(0);
  });
});
