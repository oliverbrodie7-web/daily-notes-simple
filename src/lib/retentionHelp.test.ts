import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RetentionHelpDialog } from "../components/RetentionHelpDialog";
import { SettingsScreen } from "../components/SettingsScreen";
import { TrackerScreen } from "../components/TrackerScreen";
import { DEFAULT_NAV_LABELS, SCREEN_KEYS, GROUP_KEYS } from "./navLabels";
import {
  copyRetentionExample,
  RETENTION_HELP_EXAMPLE,
  RETENTION_HELP_EXAMPLE_STEP,
  RETENTION_HELP_INTRO,
  RETENTION_HELP_NOTE,
  RETENTION_HELP_STEPS,
  RETENTION_HELP_TITLE,
  retentionHelpText,
} from "./retentionHelp";

// The dialog holds state, so it is rendered for real and the markup read,
// the way the student picker is tested. There is no DOM and no new package:
// react-dom is already a dependency, and renderToStaticMarkup never runs an
// effect, which is also what proves nothing is fetched on open.

const BUTTON_LABEL = "How do I analyse the re-enrol data?";

// Built from their code points on purpose. Writing either character here,
// even inside a check that forbids it, would put one in the repository, and
// the formatter turns a \u escape back into the character itself.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const DIALOG_SOURCE = source("../components/RetentionHelpDialog.tsx");
const PICKER_SOURCE = source("../components/MatchStudentPanel.tsx");
const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");
const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

function dialogHtml(): string {
  return renderToStaticMarkup(createElement(RetentionHelpDialog, { onClose: () => {} }));
}

// The markup escapes an apostrophe, so the words are read back through the
// same decoding a browser does before they are compared. Markup assertions
// use the raw html; prose assertions use this.
function dialogText(): string {
  return dialogHtml().replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

function settingsHtml(state: string): string {
  const gate = {
    state,
    storedHash: "hash",
    locked: state !== "unlocked",
    touch: () => {},
    lockNow: () => {},
    verify: async () => true,
    saveNewPin: async () => true,
    notePinChanged: () => {},
  };
  return renderToStaticMarkup(
    createElement(SettingsScreen, {
      onDirtyChange: () => {},
      pinGate: gate,
      labels: DEFAULT_NAV_LABELS,
      onLabelsChange: () => {},
      // The gate shape is the hook's own and is not exported as a plain
      // object, so the stand in is asserted structurally instead.
    } as never),
  );
}

// The Parents screen, where the end of term strip now lives. Rendered to a
// string so no effect fires; students stays null, so only the strip and the
// loading line render.
function trackerHtml(state: string): string {
  const gate = {
    state,
    storedHash: "hash",
    locked: state !== "unlocked",
    touch: () => {},
    lockNow: () => {},
    verify: async () => true,
    saveNewPin: async () => true,
    notePinChanged: () => {},
  };
  return renderToStaticMarkup(createElement(TrackerScreen, { pinGate: gate } as never));
}

describe("the button on the Parents strip", () => {
  test("the Parents dashboard shows a 1 Re-enrol analysis button when unlocked", () => {
    const html = trackerHtml("unlocked");
    expect(html).toContain("1 Re-enrol analysis");
    // A real button in the end of term strip at the top.
    const at = html.indexOf("1 Re-enrol analysis");
    const strip = html.indexOf('class="eot-strip"');
    expect(strip).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(strip);
    expect(html.slice(strip, at)).toContain('<button type="button" class="eot-strip-button"');
    // The strip carries its label and both actions.
    expect(html).toContain(">End of term</span>");
  });

  test("it is gone from Settings", () => {
    const settings = settingsHtml("unlocked");
    expect(settings).not.toContain("1 Re-enrol analysis");
    // The old long card label is gone too.
    expect(settings).not.toContain(BUTTON_LABEL);
    expect(settings).not.toContain("settings-help-button");
    // The wiring left Settings and now lives on the tracker.
    expect(SETTINGS_SOURCE).not.toContain("setHelpOpen");
    expect(SETTINGS_SOURCE).not.toContain("RetentionHelpDialog");
    expect(TRACKER_SOURCE).toContain("setHelpOpen(true)");
    expect(TRACKER_SOURCE).toContain("RetentionHelpDialog onClose");
  });

  test("it only shows once the Parents PIN is entered", () => {
    // Every locked state falls to the Parents lock gate, so no strip shows.
    for (const state of ["checking", "setup", "locked", "failed"]) {
      const html = trackerHtml(state);
      expect(html).not.toContain("1 Re-enrol analysis");
      expect(html).not.toContain('class="eot-strip"');
      expect(html).not.toContain(RETENTION_HELP_INTRO);
    }
    // The strip sits below the unlock gate's early return.
    const guard = TRACKER_SOURCE.indexOf("if (!unlocked)");
    expect(guard).toBeGreaterThan(-1);
    expect(TRACKER_SOURCE.indexOf('className="eot-strip"')).toBeGreaterThan(guard);
  });

  test("tapping the button opens a dialog with the same title", () => {
    // One constant still names the dialog, even though the strip button has
    // its own short label.
    expect(RETENTION_HELP_TITLE).toBe(BUTTON_LABEL);
    expect(TRACKER_SOURCE).toContain("onClick={() => setHelpOpen(true)}");
    expect(TRACKER_SOURCE).toContain(
      "{helpOpen ? <RetentionHelpDialog onClose={() => setHelpOpen(false)} /> : null}",
    );
    // And the dialog titles itself with that same constant.
    const html = dialogHtml();
    expect(html).toContain(`id="retention-help-title">${BUTTON_LABEL}</p>`);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="retention-help-title"');
  });
});

describe("what the dialog says", () => {
  test("The dialog shows six numbered steps in the specified order", () => {
    expect(RETENTION_HELP_STEPS).toHaveLength(6);
    expect(RETENTION_HELP_STEPS.map((step) => step.lead)).toEqual([
      "Freeze the term first.",
      "Ask Claude.",
      "Run the query yourself.",
      "Upload two files.",
      "Decide any uncertain matches.",
      "Collect the results.",
    ]);
    const html = dialogHtml();
    // Six list items, numbered one to six, and the numbers follow the
    // position rather than being written into the text.
    expect(html.split('class="help-step retention-step"')).toHaveLength(7);
    for (let n = 1; n <= 6; n += 1) {
      expect(html).toContain(`<span class="help-step-number" aria-hidden="true">${n}</span>`);
    }
    expect(html).not.toContain('aria-hidden="true">7</span>');
    // On screen in the same order as the data.
    const positions = RETENTION_HELP_STEPS.map((step) => html.indexOf(step.lead));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBeGreaterThan(-1);
    // A real ordered list, so the count is announced.
    expect(html).toContain('<ol class="retention-steps" role="list">');
    // Every body is on screen, and the closing note is last.
    const words = dialogText();
    for (const step of RETENTION_HELP_STEPS) expect(words).toContain(step.body);
    expect(html.indexOf(RETENTION_HELP_NOTE)).toBeGreaterThan(html.indexOf("Collect the results."));
    // The intro comes before step one.
    expect(html.indexOf(RETENTION_HELP_INTRO)).toBeLessThan(html.indexOf("Freeze the term"));
  });

  test("Step 1 is the freeze warning", () => {
    const first = RETENTION_HELP_STEPS[0];
    expect(first?.lead).toBe("Freeze the term first.");
    expect(first?.body).toBe(
      "Supabase is cleared to take in the new term, and once it is cleared the numbers are gone. Do this before the data is wiped.",
    );
    // It warns, and it says when.
    expect(first?.body).toContain("before the data is wiped");
    const html = dialogHtml();
    // It is the step carrying the number one, not merely present somewhere.
    const one = html.indexOf('aria-hidden="true">1</span>');
    const two = html.indexOf('aria-hidden="true">2</span>');
    expect(one).toBeGreaterThan(-1);
    expect(html.slice(one, two)).toContain("Freeze the term first.");
    expect(html.slice(one, two)).toContain("before the data is wiped");
  });

  test("The dialog text contains no em dash, no en dash and no spaced hyphen", () => {
    const pieces = [
      ...retentionHelpText(),
      ...RETENTION_HELP_STEPS.map((step) => `${step.lead} ${step.body}`),
    ];
    expect(pieces.length).toBeGreaterThan(6);
    for (const piece of pieces) {
      expect(piece).not.toContain(EM_DASH);
      expect(piece).not.toContain(EN_DASH);
      expect(piece).not.toContain(" - ");
      expect(piece).not.toContain(" -");
      expect(piece).not.toContain("- ");
    }
    // The rendered markup too, comments and card wording included, so a
    // dash cannot arrive through anything the dialog prints.
    const html = dialogHtml();
    expect(html).not.toContain(EM_DASH);
    expect(html).not.toContain(EN_DASH);
    expect(html).not.toContain(" - ");
    // And neither source file carries one, including in its comments.
    for (const file of [DIALOG_SOURCE, source("./retentionHelp.ts")]) {
      expect(file).not.toContain(EM_DASH);
      expect(file).not.toContain(EN_DASH);
    }
    // The hyphens that are there are inside names, never spaced.
    expect(RETENTION_HELP_INTRO).toContain("term-retention-report");
    expect(RETENTION_HELP_TITLE).toContain("re-enrol");
  });

  test("The dialog text does not contain the business name", () => {
    const all = [...retentionHelpText(), dialogText()].join(" ").toLowerCase();
    for (const name of ["numberworks", "nwords", "number works", "miranda"]) {
      expect(all).not.toContain(name);
    }
    // Nor the apostrophe form of it.
    expect(all).not.toContain("'nwords");
    // It does name Claude and Supabase, which are the tools, not the business.
    expect(all).toContain("claude");
    expect(all).toContain("supabase");
  });
});

describe("the Copy button", () => {
  test("The Copy button copies exactly the example sentence and nothing else", async () => {
    const copy = mock(async (_text: string) => true);
    const ok = await copyRetentionExample({ copy });
    expect(ok).toBe(true);
    expect(copy.mock.calls).toHaveLength(1);
    const sent = copy.mock.calls[0]?.[0];
    expect(sent).toBe(
      "Run the term retention report. The term to measure is Term 3 and the next term is Term 4.",
    );
    expect(sent).toBe(RETENTION_HELP_EXAMPLE);
    // Nothing around it: no step number, no lead in, no heading, no
    // quotation marks and no trailing newline.
    expect(sent).not.toContain("\n");
    expect(sent).not.toContain("2.");
    expect(sent).not.toContain("Ask Claude");
    expect(sent).not.toContain(RETENTION_HELP_TITLE);
    expect(sent?.trim()).toBe(sent);
    expect(sent?.startsWith('"')).toBe(false);
    // A clipboard that refuses is reported, not thrown.
    expect(await copyRetentionExample({ copy: async () => false })).toBe(false);
    expect(
      await copyRetentionExample({
        copy: async () => {
          throw new Error("NotAllowedError");
        },
      }),
    ).toBe(false);
  });

  test("the button sits under step two and reuses the Templates copy pattern", () => {
    expect(RETENTION_HELP_EXAMPLE_STEP).toBe(2);
    const html = dialogHtml();
    const two = html.indexOf('aria-hidden="true">2</span>');
    const three = html.indexOf('aria-hidden="true">3</span>');
    const box = html.indexOf(RETENTION_HELP_EXAMPLE);
    expect(box).toBeGreaterThan(two);
    expect(box).toBeLessThan(three);
    // The example box and the same Copy label the Templates screen uses.
    expect(html).toContain('<pre class="help-code">');
    expect(html).toContain('class="row-button retention-copy"');
    expect(html).toContain(">Copy</button>");
    // One Copy button, not one per step.
    expect(html.split("retention-copy")).toHaveLength(2);
    // The same helper and the same revert as the Templates panel.
    expect(DIALOG_SOURCE).toContain('import { copyText } from "../lib/clipboard"');
    expect(DIALOG_SOURCE).toContain("setCopied(ok)");
    expect(DIALOG_SOURCE).toContain("window.setTimeout(() => setCopied(false), 1500)");
    expect(source("../components/TemplatePanel.tsx")).toContain(
      "window.setTimeout(() => setCopied(false), 1500)",
    );
  });
});

describe("closing it", () => {
  test("Escape closes the dialog and focus returns to the button", () => {
    // Bound to the document rather than the panel, so it works wherever the
    // last click landed. The same four pieces the student picker uses.
    const pieces = [
      'document.addEventListener("keydown", onKey)',
      'if (event.key === "Escape") onClose();',
      "openerRef.current = document.activeElement;",
      "if (opener instanceof HTMLElement) opener.focus();",
    ];
    for (const piece of pieces) {
      expect(DIALOG_SOURCE).toContain(piece);
      // Reused, not reinvented: the picker has the identical wiring.
      expect(PICKER_SOURCE).toContain(piece);
    }
    // The listener is removed again, so a closed dialog cannot swallow keys.
    expect(DIALOG_SOURCE).toContain('document.removeEventListener("keydown", onKey)');
    // The focus return is the effect's cleanup, which is what makes it run
    // on close rather than needing the opener to pass a ref down.
    const effect = DIALOG_SOURCE.slice(
      DIALOG_SOURCE.indexOf("openerRef.current = document.activeElement;"),
    );
    expect(effect.slice(0, 220)).toContain("return () => {");
    expect(effect.slice(0, 220)).toContain("opener.focus()");
    // And a Close button, which is the same control the picker cancels with.
    const html = dialogHtml();
    expect(html).toContain('<button type="button" class="match-cancel">Close</button>');
  });
});

describe("what it does not touch", () => {
  test("Opening the dialog makes no network request and no database call", () => {
    const files = { dialog: DIALOG_SOURCE, text: source("./retentionHelp.ts") };
    expect(Object.keys(files)).toHaveLength(2);
    for (const file of Object.values(files)) {
      // The client is never imported and never called. The word Supabase is
      // in the instructions on purpose, which is why this looks for the
      // import and the call rather than for the word.
      expect(file).not.toContain("lib/supabase");
      expect(file).not.toContain("supabase.");
      expect(file).not.toContain("createClient");
      expect(file).not.toContain("fetch(");
      expect(file).not.toContain(".from(");
      expect(file).not.toContain("http://");
      expect(file).not.toContain("https://");
      expect(file).not.toContain("XMLHttpRequest");
      expect(file).not.toContain("useEffect(() => {\n    void");
    }
    // Its imports are react, the clipboard helper and its own words. Nothing
    // else is reachable from it.
    const imports = [...DIALOG_SOURCE.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../lib/clipboard", "../lib/retentionHelp", "react"]);
    // And it renders with no stub of any kind in place, which it could not
    // do if opening it read anything.
    expect(dialogHtml().length).toBeGreaterThan(500);
    // The words themselves depend on nothing at all.
    expect([...source("./retentionHelp.ts").matchAll(/from "([^"]+)"/g)]).toHaveLength(0);
  });

  test("No navigation label, route or table was added", () => {
    // Six screens, named as they were.
    expect(SCREEN_KEYS).toHaveLength(6);
    expect(SCREEN_KEYS).toEqual(["today", "output", "parents", "manager", "settings", "templates"]);
    expect(GROUP_KEYS).toEqual(["daily", "followUp", "setup"]);
    expect(Object.keys(DEFAULT_NAV_LABELS.screens)).toHaveLength(6);
    expect(DEFAULT_NAV_LABELS.screens.settings).toBe("Settings");
    // The view union is unchanged, so there is no seventh screen.
    const switcher = source("../components/ViewSwitcher.tsx");
    expect(switcher).toContain(
      'export type AppView = "today" | "output" | "parents" | "manager" | "settings" | "templates";',
    );
    expect(switcher).not.toContain("retention");
    // No route was added.
    expect(source("../routes/index.tsx")).not.toContain("retention");
    // And nothing new reads or writes a table.
    for (const file of [DIALOG_SOURCE, source("./retentionHelp.ts")]) {
      expect(file).not.toContain('.from("');
    }
    // The Settings screen still touches exactly the one settings row it did.
    const settings = source("../components/SettingsScreen.tsx");
    expect([...settings.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual([
      "daily_notes_settings",
      "daily_notes_settings",
      "daily_notes_settings",
      "daily_notes_settings",
    ]);
  });
});
