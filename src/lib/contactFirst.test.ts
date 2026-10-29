import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactFirstCard } from "../components/ContactFirstCard";
import {
  CONTACT_FIRST_CLEAR,
  CONTACT_FIRST_TITLE,
  contactFirstFamilies,
  seeAllLabel,
  type ContactFirstFamily,
  type ContactFirstInput,
} from "./contactFirst";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

function input(over: Partial<ContactFirstInput> & { id: number | string }): ContactFirstInput {
  return {
    studentName: `Student ${over.id}`,
    parentName: `Parent ${over.id}`,
    parentPhone: "0400 000 000",
    coverage: "red",
    daysSinceLastEmail: 3,
    ...over,
  };
}

describe("who the card lists", () => {
  test("only red group families whose parent emailed this term", () => {
    const rows: ContactFirstInput[] = [
      input({ id: "red-emailed", coverage: "red", daysSinceLastEmail: 2 }), // in
      input({ id: "red-silent", coverage: "red", daysSinceLastEmail: null }), // out: never emailed
      input({ id: "teal-emailed", coverage: "teal", daysSinceLastEmail: 1 }), // out: not red
      input({ id: "green-emailed", coverage: "green", daysSinceLastEmail: 0 }), // out: not red
    ];
    const families = contactFirstFamilies(rows);
    expect(families.map((f) => f.id)).toEqual(["red-emailed"]);
  });

  test("a parent who emailed today still counts, zero days is not null", () => {
    expect(
      contactFirstFamilies([input({ id: 1, coverage: "red", daysSinceLastEmail: 0 })]),
    ).toHaveLength(1);
  });

  test("worst wait first, ties broken by student name", () => {
    const rows: ContactFirstInput[] = [
      input({ id: "a", studentName: "Ava", coverage: "red", daysSinceLastEmail: 2 }),
      input({ id: "b", studentName: "Bo", coverage: "red", daysSinceLastEmail: 30 }),
      input({ id: "c", studentName: "Cara", coverage: "red", daysSinceLastEmail: 30 }),
    ];
    // Bo and Cara both 30 days, Bo before Cara by name; Ava last at 2 days.
    expect(contactFirstFamilies(rows).map((f) => f.studentName)).toEqual(["Bo", "Cara", "Ava"]);
  });

  test("the reason is the engagement wording and carries the name, parent, phone", () => {
    const [family] = contactFirstFamilies([
      input({
        id: 1,
        studentName: "Ava Donnelly",
        parentName: "Nicole Donnelly",
        parentPhone: "0412 345 678",
        coverage: "red",
        daysSinceLastEmail: 2,
      }),
    ]);
    expect(family).toEqual({
      id: "1",
      studentName: "Ava Donnelly",
      parentName: "Nicole Donnelly",
      parentPhone: "0412 345 678",
      reason: "Emailed 2 days ago",
    });
  });

  test("an empty roster lists nobody", () => {
    expect(contactFirstFamilies([])).toEqual([]);
  });
});

describe("the footer label", () => {
  test("names the whole red group, not just the listed families", () => {
    expect(seeAllLabel(7)).toBe("See all 7 who need a touch point");
    expect(seeAllLabel(1)).toBe("See all 1 who need a touch point");
  });
});

describe("the card", () => {
  const families: ContactFirstFamily[] = [
    {
      id: "1",
      studentName: "Ava Donnelly",
      parentName: "Nicole Donnelly",
      parentPhone: "0412 345 678",
      reason: "Emailed 2 days ago",
    },
    {
      id: "2",
      studentName: "Bo Ng",
      parentName: null,
      parentPhone: null,
      reason: "Last email 4 weeks ago",
    },
  ];

  function cardHtml(over: Partial<Parameters<typeof ContactFirstCard>[0]> = {}): string {
    return renderToStaticMarkup(
      createElement(ContactFirstCard, {
        families,
        redTotal: 9,
        onDraft: () => {},
        onSeeAll: () => {},
        ...over,
      }),
    );
  }

  test("shows the title, a row per family, and the footer count", () => {
    const html = cardHtml();
    expect(html).toContain(CONTACT_FIRST_TITLE);
    expect(html).toContain("Ava Donnelly");
    expect(html).toContain("Nicole Donnelly");
    expect(html).toContain("0412 345 678");
    expect(html).toContain("Emailed 2 days ago");
    expect(html).toContain("Bo Ng");
    // A blank parent name falls back rather than printing nothing.
    expect(html).toContain("No parent name");
    // Two rows, two Draft actions.
    expect(html.split('class="contact-first-row"').length - 1).toBe(2);
    expect(html.split(">Draft email</button>").length - 1).toBe(2);
    // The footer names the whole red group.
    expect(html).toContain("See all 9 who need a touch point");
  });

  test("with no families it shows the all caught up line and no footer", () => {
    const html = cardHtml({ families: [] });
    expect(html).toContain(CONTACT_FIRST_CLEAR);
    expect(CONTACT_FIRST_CLEAR).toBe("All caught up");
    expect(html).not.toContain(CONTACT_FIRST_TITLE);
    expect(html).not.toContain("See all");
    expect(html).not.toContain("Draft email");
  });
});

describe("how the screen wires it", () => {
  test("it sits under the meter and above the P2 bar", () => {
    const meter = TRACKER_SOURCE.indexOf("<CoverageMeter");
    const card = TRACKER_SOURCE.indexOf("<ContactFirstCard");
    const bar = TRACKER_SOURCE.indexOf('className="p2-progress"');
    expect(meter).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(meter);
    expect(bar).toBeGreaterThan(card);
  });

  test("Draft opens the quick email panel, the footer filters to red", () => {
    expect(TRACKER_SOURCE).toContain("onDraft={(id) => setDraftStudentId(id)}");
    expect(TRACKER_SOURCE).toContain('onSeeAll={() => setFilterKey("red")}');
    // The footer count is the whole red group.
    expect(TRACKER_SOURCE).toContain("redTotal={coverage.red}");
    // It reads the same coverage and engagement the rest of the screen does.
    expect(TRACKER_SOURCE).toContain("coverage: row.coverage");
    expect(TRACKER_SOURCE).toContain("daysSinceLastEmail: row.emails.daysSinceLast");
  });
});
