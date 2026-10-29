import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_QUICK_EMAIL_TOPICS,
  readQuickEmailTopics,
  tidyQuickEmailTopics,
} from "./quickEmail";

// The Quick email topics editor on the Settings screen still reads and writes
// quick_email_topics, so its wiring and the tidy/read round trip keep their
// coverage here. The parent row panel no longer shows those chips.
function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");

// Built from their code points so neither character is ever written into the
// repository, even inside the check that forbids them.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

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

  test("tidy then read falls back to the defaults once the list is emptied", () => {
    expect(readQuickEmailTopics(tidyQuickEmailTopics(["", "  "]))).toEqual([
      ...DEFAULT_QUICK_EMAIL_TOPICS,
    ]);
    expect(readQuickEmailTopics(tidyQuickEmailTopics(["Spelling", " "]))).toEqual(["Spelling"]);
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

  test("the editor source carries no en or em dashes", () => {
    expect(SETTINGS_SOURCE).not.toContain(EM_DASH);
    expect(SETTINGS_SOURCE).not.toContain(EN_DASH);
  });
});
