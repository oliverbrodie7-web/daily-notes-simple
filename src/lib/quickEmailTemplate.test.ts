import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  assembleDraft,
  DEFAULT_QUICK_EMAIL_SCREENSHOTS_LINE,
  DEFAULT_QUICK_EMAIL_TEMPLATE,
  effectiveScreenshotsLine,
  effectiveTemplate,
  fillQuickEmailTemplate,
} from "./quickEmail";

// The template helpers (assembleDraft, effectiveTemplate and the rest) are no
// longer wired to any screen, but they stay exported, so their behaviour keeps
// its coverage here. The settings checks below cover the two-template editor
// that replaced the old wording editor.
function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const PANEL_SOURCE = source("../components/QuickEmailPanel.tsx");
const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");

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

describe("the settings screen wires the two-template editor", () => {
  test("it reads the three template columns from the one settings row", () => {
    expect(SETTINGS_SOURCE).toContain(
      "quick_email_positive, quick_email_bookchat, quick_email_calendly_link",
    );
    expect(SETTINGS_SOURCE).toContain('(data.quick_email_positive as string | null) ?? ""');
    expect(SETTINGS_SOURCE).toContain('(data.quick_email_bookchat as string | null) ?? ""');
    expect(SETTINGS_SOURCE).toContain('(data.quick_email_calendly_link as string | null) ?? ""');
  });

  test("saving writes the three columns back to the same row", () => {
    expect(SETTINGS_SOURCE).toContain("quick_email_positive: qePositive");
    expect(SETTINGS_SOURCE).toContain("quick_email_bookchat: qeBookchat");
    expect(SETTINGS_SOURCE).toContain("quick_email_calendly_link: qeLink");
    expect(SETTINGS_SOURCE).toContain('.eq("id", SETTINGS_ROW_ID)');
    // The card is titled for the two templates and lists the tokens as a hint.
    expect(SETTINGS_SOURCE).toContain("Quick email templates");
    expect(SETTINGS_SOURCE).toContain("{child}");
    expect(SETTINGS_SOURCE).toContain("{parent}");
    expect(SETTINGS_SOURCE).toContain("{link}");
    expect(SETTINGS_SOURCE).toContain("[[, particularly with {topic}]]");
  });

  test("the dead topic and wording editors are gone", () => {
    expect(SETTINGS_SOURCE).not.toContain("quick_email_topics");
    expect(SETTINGS_SOURCE).not.toContain("quick_email_template");
    expect(SETTINGS_SOURCE).not.toContain("quick_email_screenshots");
    expect(SETTINGS_SOURCE).not.toContain("{topics}");
  });

  test("the booking link is never hardcoded in the settings code", () => {
    // The link lives only in the column, so the source carries no URL at all.
    expect(SETTINGS_SOURCE).not.toContain("http");
    expect(SETTINGS_SOURCE).not.toContain("calendly.com");
  });

  test("the layered panel still writes only the one quick_emails row", () => {
    // The builder changed, but the one insert the flow makes is unchanged.
    expect([...PANEL_SOURCE.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual([
      "quick_emails",
    ]);
  });
});
