import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickEmailPanel } from "../components/QuickEmailPanel";
import {
  assembleDraft,
  DEFAULT_QUICK_EMAIL_SCREENSHOTS_LINE,
  DEFAULT_QUICK_EMAIL_TEMPLATE,
  effectiveScreenshotsLine,
  effectiveTemplate,
  fillQuickEmailTemplate,
} from "./quickEmail";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const PANEL_SOURCE = source("../components/QuickEmailPanel.tsx");
const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");
const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");
const ROUTE_SOURCE = source("../routes/index.tsx");
const STYLES_SOURCE = source("../styles.css");

function panelHtml(over: Partial<Parameters<typeof QuickEmailPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(QuickEmailPanel, {
      studentId: 1,
      studentName: "Ava Donnelly",
      parentName: "Nicole Donnelly",
      parentEmail: "n@example.com",
      topics: ["Spelling"],
      onClose: () => {},
      onScheduled: () => {},
      ...over,
    }),
  );
}

describe("the editable template fills the placeholders", () => {
  test("{parent} and {child} become the first names", () => {
    const draft = assembleDraft({
      parentName: "Nicole Donnelly",
      studentName: "Ava Donnelly",
      topics: [],
      offerScreenshots: false,
    });
    expect(draft).toContain("Hi Nicole,");
    expect(draft).toContain("how Ava is going");
    // Surnames never appear.
    expect(draft).not.toContain("Donnelly");
  });

  test("{topics} becomes ' with <topics>' when chosen and nothing when none", () => {
    const withChips = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: ["Spelling", "Times tables"],
      offerScreenshots: false,
    });
    expect(withChips).toContain("going with Spelling and Times tables.");

    const none = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: [],
      offerScreenshots: false,
    });
    // No topics phrase, and no dangling "with".
    expect(none).toContain("how Ava is going.");
    expect(none).not.toContain("with");
  });

  test("fillQuickEmailTemplate replaces each placeholder in a custom template", () => {
    const out = fillQuickEmailTemplate("Dear {parent}, {child} did well{topics}.", {
      parent: "Sam",
      child: "Max",
      topics: ["focus"],
    });
    expect(out).toBe("Dear Sam, Max did well with focus.");
    const empty = fillQuickEmailTemplate("{child}{topics}", {
      parent: "x",
      child: "Max",
      topics: [],
    });
    expect(empty).toBe("Max");
  });

  test("a custom saved template changes the wording", () => {
    const draft = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: [],
      offerScreenshots: false,
      template: "G'day {parent}, a note about {child}.",
    });
    expect(draft).toContain("G'day Nicole, a note about Ava.");
    // The built-in opener is gone.
    expect(draft).not.toContain("I wanted to share a quick update");
  });
});

describe("the screenshots sentence", () => {
  test("appears only when the toggle is on", () => {
    const on = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: [],
      offerScreenshots: true,
      screenshotsLine: "Happy to send screenshots.",
    });
    expect(on).toContain("Happy to send screenshots.");
    const off = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: [],
      offerScreenshots: false,
      screenshotsLine: "Happy to send screenshots.",
    });
    expect(off).not.toContain("Happy to send screenshots.");
  });

  test("falls back to the built-in sentence when none is saved", () => {
    const on = assembleDraft({
      parentName: "Nicole",
      studentName: "Ava",
      topics: [],
      offerScreenshots: true,
    });
    expect(on).toContain("screenshots of how it is done now");
  });
});

describe("the fallbacks to the built-in wording", () => {
  test("empty or missing template or sentence falls back", () => {
    expect(effectiveTemplate(null)).toBe(DEFAULT_QUICK_EMAIL_TEMPLATE);
    expect(effectiveTemplate("   ")).toBe(DEFAULT_QUICK_EMAIL_TEMPLATE);
    expect(effectiveTemplate(42)).toBe(DEFAULT_QUICK_EMAIL_TEMPLATE);
    expect(effectiveTemplate("Hi {parent}")).toBe("Hi {parent}");
    expect(effectiveScreenshotsLine("")).toBe(DEFAULT_QUICK_EMAIL_SCREENSHOTS_LINE);
    expect(effectiveScreenshotsLine("Custom")).toBe("Custom");
    // The built-in template uses the three placeholders.
    for (const token of ["{parent}", "{child}", "{topics}"]) {
      expect(DEFAULT_QUICK_EMAIL_TEMPLATE).toContain(token);
    }
  });
});

describe("the panel previews the saved template", () => {
  test("the preview follows the template it is handed", () => {
    const a = panelHtml({ template: "First wording for {child}." });
    expect(a).toContain("First wording for Ava.");
    const b = panelHtml({ template: "Second wording for {child}." });
    expect(b).toContain("Second wording for Ava.");
    expect(b).not.toContain("First wording");
  });

  test("with no saved template it shows the built-in opener", () => {
    const html = panelHtml();
    expect(html).toContain("Hi Nicole,");
    expect(html).toContain("I wanted to share a quick update");
  });
});

describe("the panel link opens the template editor", () => {
  test("the link sits on the Preview heading row, only when an edit handler is wired", () => {
    const withLink = panelHtml({ onEditTemplate: () => {} });
    expect(withLink).toContain("Edit template");
    // On the Preview heading row, with the pencil rendered before the words.
    expect(withLink).toContain('class="quick-email-preview-head"');
    expect(withLink).toMatch(/quick-email-edit-link"><svg/);
    const without = panelHtml();
    expect(without).not.toContain("Edit template");
  });

  test("it is an accent pencil link, and the old under-preview link is gone", () => {
    expect(PANEL_SOURCE).toContain('className="quick-email-edit-link"');
    expect(PANEL_SOURCE).toContain("<PencilIcon");
    expect(PANEL_SOURCE).toContain('import { PencilIcon } from "./Icons"');
    // The old wording and class no longer exist anywhere in the panel.
    expect(PANEL_SOURCE).not.toContain("Need to change the wording");
    expect(PANEL_SOURCE).not.toContain("quick-email-template-link");
    // The link is the app accent and carries no underline.
    const start = STYLES_SOURCE.indexOf(".quick-email-edit-link {");
    const linkCss = STYLES_SOURCE.slice(start, start + 240);
    expect(start).toBeGreaterThan(-1);
    expect(linkCss).toContain("color: var(--accent)");
    expect(linkCss).not.toContain("underline");
  });

  test("the link closes the panel and calls the edit handler", () => {
    // Asserted on the source: the click runs both, so the screen navigates.
    expect(PANEL_SOURCE).toMatch(/onClose\(\);\s*onEditTemplate\(\);/);
  });

  test("the screen and route carry the request to the Settings card", () => {
    // The screen hands the panel its edit handler and the saved wording.
    expect(TRACKER_SOURCE).toContain("onEditTemplate={onEditTemplate}");
    expect(TRACKER_SOURCE).toContain("template={quickTemplate}");
    expect(TRACKER_SOURCE).toContain("screenshotsLine={quickScreenshotsLine}");
    // The route points that handler at the quick email template card.
    expect(ROUTE_SOURCE).toContain('setSettingsFocus("quick-email-template")');
    expect(ROUTE_SOURCE).toContain('handleViewChange("settings")');
    expect(ROUTE_SOURCE).toContain("scrollTo={settingsFocus}");
    // The Settings screen scrolls to that card when asked.
    expect(SETTINGS_SOURCE).toContain('scrollTo !== "quick-email-template"');
    expect(SETTINGS_SOURCE).toContain("templateCardRef.current");
  });
});

describe("the settings screen wires the template editor", () => {
  test("it reads the wording columns from the one settings row", () => {
    expect(SETTINGS_SOURCE).toContain("quick_email_template, quick_email_screenshots_line");
    expect(SETTINGS_SOURCE).toContain("effectiveTemplate(data.quick_email_template)");
    expect(SETTINGS_SOURCE).toContain(
      "effectiveScreenshotsLine(data.quick_email_screenshots_line)",
    );
  });

  test("saving writes both wording columns back to the same row", () => {
    expect(SETTINGS_SOURCE).toContain("quick_email_template: qeTemplate");
    expect(SETTINGS_SOURCE).toContain("quick_email_screenshots_line: qeScreenshots");
    expect(SETTINGS_SOURCE).toContain('.eq("id", SETTINGS_ROW_ID)');
    // The placeholders are listed as a hint on the card.
    expect(SETTINGS_SOURCE).toContain("Quick email template");
    expect(SETTINGS_SOURCE).toContain("{topics}");
  });

  test("the screen reads the field the editor writes, with no change to scheduling", () => {
    // The panel's wording comes from the same column the editor saves.
    expect(TRACKER_SOURCE).toContain("quick_email_template");
    // The one insert the flow makes is still just the quick_emails row.
    expect([...PANEL_SOURCE.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual([
      "quick_emails",
    ]);
  });
});
