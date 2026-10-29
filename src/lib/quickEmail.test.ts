import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickEmailPanel } from "../components/QuickEmailPanel";
import { TouchPointsBody } from "../components/TouchPoints";
import { coverageCounts, coverageGroup, type CoverageGroup } from "./coverage";
import {
  assembleDraft,
  DEFAULT_QUICK_EMAIL_TOPICS,
  effectiveTopics,
  joinTopics,
  quickEmailLine,
  quickEmailRow,
  readQuickEmailTopics,
  scheduleQuickEmail,
  type QuickEmailRow,
} from "./quickEmail";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const PANEL_SOURCE = source("../components/QuickEmailPanel.tsx");
const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

function panelHtml(over: Partial<Parameters<typeof QuickEmailPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(QuickEmailPanel, {
      studentId: 1,
      studentName: "Ava Donnelly",
      parentName: "Nicole Donnelly",
      parentEmail: "nicole@example.com",
      topics: [...DEFAULT_QUICK_EMAIL_TOPICS],
      onClose: () => {},
      onScheduled: () => {},
      ...over,
    }),
  );
}

describe("the topic chips", () => {
  test("match daily_notes_settings.quick_email_topics when it has words", () => {
    expect(readQuickEmailTopics(["Spelling", "Times tables"])).toEqual([
      "Spelling",
      "Times tables",
    ]);
    // Blanks are dropped; a column of nothing but blanks falls back.
    expect(readQuickEmailTopics(["Spelling", "  ", ""])).toEqual(["Spelling"]);
  });

  test("fall back to the six defaults when the field is empty or missing", () => {
    expect(readQuickEmailTopics(null)).toEqual([...DEFAULT_QUICK_EMAIL_TOPICS]);
    expect(readQuickEmailTopics(undefined)).toEqual([...DEFAULT_QUICK_EMAIL_TOPICS]);
    expect(readQuickEmailTopics([])).toEqual([...DEFAULT_QUICK_EMAIL_TOPICS]);
    expect(readQuickEmailTopics("not a list")).toEqual([...DEFAULT_QUICK_EMAIL_TOPICS]);
    expect(DEFAULT_QUICK_EMAIL_TOPICS).toHaveLength(6);
  });

  test("the panel renders exactly the chips it is handed", () => {
    const html = panelHtml({ topics: ["Spelling", "Times tables"] });
    expect(html).toContain("Spelling");
    expect(html).toContain("Times tables");
    // The chip buttons, not the chips container. None are selected on open,
    // so each carries the bare class.
    expect(html.split('class="quick-email-chip"').length - 1).toBe(2);
  });

  test("the screen reads the setting and hands the panel those chips", () => {
    expect(TRACKER_SOURCE).toContain('.select("quick_email_topics');
    expect(TRACKER_SOURCE).toContain("readQuickEmailTopics(");
    expect(TRACKER_SOURCE).toContain("topics={quickTopics}");
  });
});

describe("the assembled draft", () => {
  test("uses the correct parent and child first names", () => {
    const draft = assembleDraft({
      parentName: "Nicole Donnelly",
      studentName: "Ava Donnelly",
      topics: ["Homework routine"],
      offerScreenshots: false,
    });
    expect(draft).toContain("Hi Nicole,");
    expect(draft).toContain("Ava");
    // Not the surnames.
    expect(draft).not.toContain("Donnelly");
  });

  test("falls back the way the app does when the parent name is blank", () => {
    const draft = assembleDraft({
      parentName: null,
      studentName: "Ava Donnelly",
      topics: [],
      offerScreenshots: false,
    });
    expect(draft).toContain("Hi there,");
  });

  test("names the chosen topics and the screenshot offer when it is on", () => {
    const draft = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: ["Homework routine", "Progress this term"],
      offerScreenshots: true,
    });
    expect(draft).toContain("Homework routine and Progress this term");
    expect(draft).toContain("screenshots of how it is done now");
    // Off, the offer line is gone.
    const without = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: ["Homework routine"],
      offerScreenshots: false,
    });
    expect(without).not.toContain("screenshots");
  });

  test("joins topics and folds in the typed one without repeating it", () => {
    expect(joinTopics(["a"])).toBe("a");
    expect(joinTopics(["a", "b"])).toBe("a and b");
    expect(joinTopics(["a", "b", "c"])).toBe("a, b and c");
    expect(effectiveTopics(["a"], "b")).toEqual(["a", "b"]);
    expect(effectiveTopics(["a"], "a")).toEqual(["a"]);
    expect(effectiveTopics(["a"], "   ")).toEqual(["a"]);
  });

  test("the panel shows the draft with the names in it", () => {
    const html = panelHtml();
    expect(html).toContain("Hi Nicole,");
    expect(html).toContain("Ava");
  });
});

describe("scheduling writes one quick_emails row and nothing else", () => {
  test("the row is exactly the five columns", () => {
    const row = quickEmailRow({
      studentId: 7,
      parentEmail: "p@example.com",
      topics: ["Homework routine"],
      offerScreenshots: true,
      body: "Hi there,",
    });
    expect(row).toEqual({
      student_id: 7,
      parent_email: "p@example.com",
      topics: ["Homework routine"],
      offer_screenshots: true,
      body: "Hi there,",
    });
    // No daily_notes shaped fields.
    expect(Object.keys(row).sort()).toEqual([
      "body",
      "offer_screenshots",
      "parent_email",
      "student_id",
      "topics",
    ]);
  });

  test("Schedule calls the quick_emails insert exactly once with that row", async () => {
    const insert = mock(async (_row: QuickEmailRow) => ({ error: null }));
    const result = await scheduleQuickEmail(
      { insert },
      {
        studentId: 7,
        parentEmail: "p@example.com",
        topics: ["Homework routine"],
        offerScreenshots: false,
        body: "Hi there,",
      },
    );
    expect(result.ok).toBe(true);
    expect(insert.mock.calls).toHaveLength(1);
    expect(insert.mock.calls[0]?.[0].student_id).toBe(7);
  });

  test("a failed or throwing insert is reported, not thrown", async () => {
    expect(
      (await scheduleQuickEmail({ insert: async () => ({ error: new Error("x") }) }, baseArgs()))
        .ok,
    ).toBe(false);
    expect(
      (
        await scheduleQuickEmail(
          {
            insert: async () => {
              throw new Error("down");
            },
          },
          baseArgs(),
        )
      ).ok,
    ).toBe(false);
  });

  test("the panel writes only quick_emails: no daily_notes, no Gmail, no other table", () => {
    expect(PANEL_SOURCE).toContain('.from("quick_emails").insert(row)');
    // The only table it touches is quick_emails, so no daily_notes write and
    // no other table, whatever the explaining comments say.
    expect([...PANEL_SOURCE.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual([
      "quick_emails",
    ]);
    // No Gmail client, no fetch, no other write verb.
    expect(PANEL_SOURCE).not.toContain(".update(");
    expect(PANEL_SOURCE).not.toContain(".delete(");
    expect(PANEL_SOURCE).not.toContain("fetch(");
  });

  function baseArgs() {
    return {
      studentId: 1,
      parentEmail: "p@example.com",
      topics: ["x"],
      offerScreenshots: false,
      body: "b",
    };
  }
});

describe("the family moves out of red", () => {
  // A student is red with no P2, no other contact, no touch point.
  const RED = { hasFullP2: false, hasOtherContact: false };

  test("a quick email flips that student from red to teal", () => {
    expect(coverageGroup(RED, 0)).toBe("red");
    // The shared touch point count folds in the quick email, so it is now 1.
    expect(coverageGroup(RED, 1)).toBe("teal");
  });

  test("the red count drops by one when one red family gets a quick email", () => {
    // Three red families and two already teal.
    const before: CoverageGroup[] = [
      coverageGroup(RED, 0),
      coverageGroup(RED, 0),
      coverageGroup(RED, 0),
      coverageGroup(RED, 1),
      coverageGroup(RED, 2),
    ];
    expect(coverageCounts(before).red).toBe(3);
    // One of the three is scheduled a quick email, so its count becomes 1.
    const after: CoverageGroup[] = [
      coverageGroup(RED, 1),
      coverageGroup(RED, 0),
      coverageGroup(RED, 0),
      coverageGroup(RED, 1),
      coverageGroup(RED, 2),
    ];
    expect(coverageCounts(after).red).toBe(2);
  });

  test("the screen folds the scheduled email in at once, without a daily_notes write", () => {
    // The optimistic handler adds the quick email to the per student map,
    // which feeds the shared count and so the coverage group.
    expect(TRACKER_SOURCE).toContain("function handleDraftScheduled");
    expect(TRACKER_SOURCE).toContain("setQuickEmailsByStudent((current)");
    expect(TRACKER_SOURCE).toContain("handleDraftScheduled(draftStudentId, topics)");
    // The handler never writes daily_notes.
    const handler = TRACKER_SOURCE.slice(
      TRACKER_SOURCE.indexOf("function handleDraftScheduled"),
      TRACKER_SOURCE.indexOf("function handleDraftScheduled") + 600,
    );
    expect(handler).not.toContain("daily_notes");
  });
});

describe("the touch point panel lists quick emails", () => {
  test("a quick email shows as its own line with the topics and the date", () => {
    expect(quickEmailLine(["Homework routine", "Focus"], "12 August 2026")).toBe(
      "Quick email: Homework routine, Focus 12 August 2026",
    );
    const html = renderToStaticMarkup(
      createElement(TouchPointsBody, {
        studentName: "Ava",
        touch: { count: 0, latestDate: null, entries: [] },
        quickEmails: [{ topics: ["Homework routine"], date: "2026-08-12" }],
      }),
    );
    expect(html).toContain("Quick email: Homework routine");
  });

  test("the screen opens the panel for a quick email only student and passes the list", () => {
    // The gate opens on a quick email even with no notes summary. Asserted in
    // pieces so the formatter's wrapping cannot break it.
    expect(TRACKER_SOURCE).toContain('openKind === "touch" &&');
    expect(TRACKER_SOURCE).toContain("touch || quickEmailsByStudent.has(String(student.id))");
    expect(TRACKER_SOURCE).toContain("quickEmails={quickEmailsByStudent.get(String(student.id))");
  });
});

describe("the Copy button copies the draft", () => {
  test("the panel copies its body text and shows Copy", () => {
    expect(PANEL_SOURCE).toContain('import { copyText } from "../lib/clipboard"');
    expect(PANEL_SOURCE).toContain("await copyText(body)");
    const html = panelHtml();
    expect(html).toContain(">Copy</button>");
    expect(html).toContain(">Schedule Draft Tonight</button>");
  });
});
