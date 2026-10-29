import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickEmailPanel } from "../components/QuickEmailPanel";
import {
  DEFAULT_QUICK_EMAIL_TOPICS,
  readQuickEmailTopics,
  tidyQuickEmailTopics,
} from "./quickEmail";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");
const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

// Built from their code points so neither character is ever written into the
// repository, even inside the check that forbids them.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

// The chips the panel renders are the topics it is handed, so a render with
// the saved topics proves what the parent row would show.
function panelChips(topics: string[]): string {
  return renderToStaticMarkup(
    createElement(QuickEmailPanel, {
      studentId: 1,
      studentName: "Ava",
      parentName: "Nicole",
      parentEmail: "n@example.com",
      topics,
      onClose: () => {},
      onScheduled: () => {},
    }),
  );
}

describe("tidying topics for saving", () => {
  test("trims each, drops the blanks, keeps the order", () => {
    expect(tidyQuickEmailTopics([" Spelling ", "Times tables", "  "])).toEqual([
      "Spelling",
      "Times tables",
    ]);
    // A list of nothing but blanks tidies to empty, which is a safe thing to
    // store because the reader falls back to the defaults.
    expect(tidyQuickEmailTopics(["", "   "])).toEqual([]);
    // Order is never sorted.
    expect(tidyQuickEmailTopics(["b", "a"])).toEqual(["b", "a"]);
  });
});

describe("the edited topics reach the quick email panel", () => {
  test("renaming a topic and saving shows the edited chips", () => {
    // What the editor stores, then what the screen reads back for the panel.
    const stored = tidyQuickEmailTopics(["Spelling", " Times tables ", ""]);
    expect(stored).toEqual(["Spelling", "Times tables"]);
    const html = panelChips(readQuickEmailTopics(stored));
    expect(html).toContain("Spelling");
    expect(html).toContain("Times tables");
    // Exactly those two chips, none selected on open.
    expect(html.split('class="quick-email-chip"').length - 1).toBe(2);
    // The old defaults are no longer offered.
    expect(html).not.toContain("Homework routine");
  });

  test("removing every topic and saving falls back to the six defaults", () => {
    const stored = tidyQuickEmailTopics(["", "   "]);
    expect(stored).toEqual([]);
    // The reader falls back, so the panel shows the six defaults once more.
    const forPanel = readQuickEmailTopics(stored);
    expect(forPanel).toEqual([...DEFAULT_QUICK_EMAIL_TOPICS]);
    const html = panelChips(forPanel);
    for (const topic of DEFAULT_QUICK_EMAIL_TOPICS) {
      expect(html).toContain(topic);
    }
    expect(html.split('class="quick-email-chip"').length - 1).toBe(6);
  });
});

describe("how the settings screen wires the editor", () => {
  test("it reads quick_email_topics from the one settings row", () => {
    // A substring of the select so adding more columns later cannot break it.
    expect(SETTINGS_SOURCE).toContain("email_subject, email_template, quick_email_topics");
    // Seeded through the shared reader, so an empty column opens on the
    // six defaults as the starting point.
    expect(SETTINGS_SOURCE).toContain("readQuickEmailTopics(data.quick_email_topics)");
  });

  test("saving writes the tidied array back to the same row", () => {
    // Asserted in pieces so the formatter's wrapping cannot break it.
    expect(SETTINGS_SOURCE).toContain("tidyQuickEmailTopics(topics)");
    expect(SETTINGS_SOURCE).toContain("quick_email_topics: tidy");
    expect(SETTINGS_SOURCE).toContain('.eq("id", SETTINGS_ROW_ID)');
  });

  test("the editor writes the exact field the panel reads", () => {
    // The screen that mounts the panel reads the field the editor writes, so
    // a change in Settings shows up in the chips with no code change.
    expect(TRACKER_SOURCE).toContain('.select("quick_email_topics');
    expect(SETTINGS_SOURCE).toContain("quick_email_topics: tidy");
  });

  test("the editor source carries no en or em dashes", () => {
    expect(SETTINGS_SOURCE).not.toContain(EM_DASH);
    expect(SETTINGS_SOURCE).not.toContain(EN_DASH);
  });
});
