import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

// The two leading row actions live in the per row template inside
// TrackerScreen, so they are read from its source: one envelope that opens
// the quick email panel and one message bubble that is only a placeholder.
function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

const ENVELOPE = TRACKER_SOURCE.indexOf('title="Draft email"');
const SMS = TRACKER_SOURCE.indexOf('title="Send SMS"');
const SPLIT = TRACKER_SOURCE.indexOf("<RowLogSplit");

describe("the row action icons", () => {
  test("both icons sit in the row, before the Low risk split button", () => {
    expect(ENVELOPE).toBeGreaterThan(-1);
    expect(SMS).toBeGreaterThan(-1);
    expect(SPLIT).toBeGreaterThan(-1);
    // Reading order: envelope, then the SMS placeholder, then the split.
    expect(ENVELOPE).toBeLessThan(SMS);
    expect(SMS).toBeLessThan(SPLIT);
  });

  test("they are square buttons; the envelope wears the accent, the SMS is neutral", () => {
    // Sized to match the clock and the "..." button, which use this class.
    const envButton = TRACKER_SOURCE.slice(ENVELOPE - 200, ENVELOPE);
    expect(envButton).toContain('className="row-square-button is-accent"');
    const smsButton = TRACKER_SOURCE.slice(SMS - 200, SMS);
    expect(smsButton).toContain('className="row-square-button"');
    // The quieter of the two: no accent on the placeholder.
    expect(smsButton).not.toContain("is-accent");
  });

  test("the envelope opens the quick email panel for that student", () => {
    // The same handoff the contact first card uses: it sets the draft id,
    // which mounts the one QuickEmailPanel at screen level for that student.
    const envClick = TRACKER_SOURCE.slice(ENVELOPE, ENVELOPE + 160);
    expect(envClick).toContain("setDraftStudentId(String(student.id))");
  });

  test('"Draft email" is gone from the "..." menu, so it is not duplicated', () => {
    // The old menu item put the words "Draft email" right before a
    // MailIcon carrying the action-menu-icon class. Nothing should now.
    expect(TRACKER_SOURCE).not.toMatch(/Draft email[\s\S]{0,60}action-menu-icon/);
    // The other menu items that happen to mention email are untouched.
    expect(TRACKER_SOURCE).toContain("Draft a re-engagement email");
    expect(TRACKER_SOURCE).toContain("Send an email");
  });

  test("the SMS icon only shows a coming soon message and writes nothing", () => {
    const smsClick = TRACKER_SOURCE.slice(SMS, SMS + 140);
    expect(smsClick).toContain('showExportMessage("SMS sending is coming soon")');
    // A placeholder: not wired to a panel, and nothing written to Supabase.
    expect(smsClick).not.toContain("openPanel");
    expect(smsClick).not.toContain("supabase");
    expect(smsClick).not.toContain("insert");
  });
});
