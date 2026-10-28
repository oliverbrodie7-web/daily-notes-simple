import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResetPromptBody, ResetPromptDialog } from "../components/ResetPromptDialog";
import { SettingsScreen } from "../components/SettingsScreen";
import { TrackerScreen } from "../components/TrackerScreen";
import { DEFAULT_NAV_LABELS } from "./navLabels";
import {
  copyResetPrompt,
  loadResetPrompt,
  resetPromptOutcome,
  RESET_PROMPT_BUTTON_LABEL,
  RESET_PROMPT_CALLOUT,
  RESET_PROMPT_EMPTY,
  RESET_PROMPT_FAILED,
  RESET_PROMPT_INTRO,
  RESET_PROMPT_TITLE,
  type ResetPromptReader,
} from "./resetPrompt";

// Built from code points so this file can forbid the characters without ever
// holding one, since the formatter turns a \u escape back into the character.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const DIALOG_SOURCE = source("../components/ResetPromptDialog.tsx");
const PICKER_SOURCE = source("../components/MatchStudentPanel.tsx");
const LIB_SOURCE = source("./resetPrompt.ts");
const SETTINGS_SOURCE = source("../components/SettingsScreen.tsx");
const TRACKER_SOURCE = source("../components/TrackerScreen.tsx");

function bodyHtml(state: Parameters<typeof ResetPromptBody>[0]["state"], copied = false): string {
  return renderToStaticMarkup(createElement(ResetPromptBody, { state, copied, onCopy: () => {} }));
}

function dialogHtml(): string {
  // Rendered to a string, so no effect runs: the one read never fires, which
  // is also what proves opening it makes no call during render. The initial
  // state is loading.
  return renderToStaticMarkup(createElement(ResetPromptDialog, { onClose: () => {} }));
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
    } as never),
  );
}

// The Parents screen, where the end of term strip now lives. Rendered to a
// string, so no effect and no network fires; students stays null, so only
// the strip and the loading line render, which is all this needs to see.
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

describe("deciding what to show", () => {
  test("saved text is shown as text, exactly as stored", () => {
    const out = resetPromptOutcome("Clear the parents.\n  Keep the students.", false);
    expect(out).toEqual({ kind: "text", text: "Clear the parents.\n  Keep the students." });
  });

  test("an empty or whitespace only column shows the placeholder, not a box", () => {
    for (const value of [null, undefined, "", "   ", "\n\n", " \t "]) {
      expect(resetPromptOutcome(value, false)).toEqual({ kind: "empty" });
    }
  });

  test("a read error is a failure, which is not the same as empty", () => {
    expect(resetPromptOutcome(null, true)).toEqual({ kind: "failed" });
    // An error wins even if a value somehow came back with it.
    expect(resetPromptOutcome("anything", true)).toEqual({ kind: "failed" });
  });

  test("leading and trailing blank lines in real text are kept, since it is pasted elsewhere", () => {
    const messy = "\nRun this first.\n\nThen this.\n";
    expect(resetPromptOutcome(messy, false)).toEqual({ kind: "text", text: messy });
  });
});

describe("the one read", () => {
  function reader(result: { value: string | null; error: boolean }): ResetPromptReader {
    return { read: async () => result };
  }

  test("a reader returning text lands on the text state", async () => {
    expect(await loadResetPrompt(reader({ value: "Do the reset.", error: false }))).toEqual({
      kind: "text",
      text: "Do the reset.",
    });
  });

  test("a reader returning nothing lands on empty", async () => {
    expect(await loadResetPrompt(reader({ value: null, error: false }))).toEqual({ kind: "empty" });
  });

  test("a reader returning an error lands on failed", async () => {
    expect(await loadResetPrompt(reader({ value: null, error: true }))).toEqual({ kind: "failed" });
  });

  test("a reader that rejects is caught and lands on failed, never thrown", async () => {
    const throwing: ResetPromptReader = {
      read: async () => {
        throw new Error("column does not exist");
      },
    };
    expect(await loadResetPrompt(throwing)).toEqual({ kind: "failed" });
  });
});

describe("the Copy button copies the whole text", () => {
  test("it hands the exact saved text to the clipboard and reports success", async () => {
    // Deliberately carrying leading and trailing whitespace, so a copy that
    // quietly trimmed or otherwise altered the text would be caught.
    const text = "\n  Line one\nLine two\nLine three  \n";
    const copy = mock(async (_t: string) => true);
    const ok = await copyResetPrompt({ copy }, text);
    expect(ok).toBe(true);
    expect(copy.mock.calls).toHaveLength(1);
    expect(copy.mock.calls[0]?.[0]).toBe(text);
    expect(copy.mock.calls[0]?.[0]).not.toBe(text.trim());
  });

  test("a clipboard that refuses or throws is reported, not thrown", async () => {
    expect(await copyResetPrompt({ copy: async () => false }, "x")).toBe(false);
    expect(
      await copyResetPrompt(
        {
          copy: async () => {
            throw new Error("NotAllowedError");
          },
        },
        "x",
      ),
    ).toBe(false);
  });

  test("it copies only the prompt text, never the callout or the reassurance", async () => {
    const prompt = "Freeze the term, then run the query.";
    const copy = mock(async (_t: string) => true);
    await copyResetPrompt({ copy }, prompt);
    const sent = copy.mock.calls[0]?.[0];
    expect(sent).toBe(prompt);
    // The instruction lines are shown around the block, never copied with it.
    expect(sent).not.toContain(RESET_PROMPT_CALLOUT);
    expect(sent).not.toContain(RESET_PROMPT_INTRO);
    expect(sent).not.toContain("Touch Points");
    // And the component only ever hands it the saved text, from the text state.
    expect(DIALOG_SOURCE).toContain("copyResetPrompt({ copy: copyText }, state.text)");
  });
});

describe("the panel body", () => {
  test("the saved text sits in a scrollable, selectable block with a Copy button", () => {
    const html = bodyHtml({ kind: "text", text: "The whole prompt" });
    expect(html).toContain('class="help-code reset-prompt-text"');
    // A pre is selectable by default, and focusable here so a long block can
    // be scrolled from the keyboard.
    expect(html).toContain("<pre");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("The whole prompt");
    // The Copy button, with the Templates label.
    expect(html).toContain('class="row-button reset-prompt-copy"');
    expect(html).toContain(">Copy</button>");
  });

  test("the Copy button shows Copied after a copy", () => {
    expect(bodyHtml({ kind: "text", text: "x" }, true)).toContain(">Copied</button>");
    expect(bodyHtml({ kind: "text", text: "x" }, false)).toContain(">Copy</button>");
  });

  test("an empty column shows the placeholder instead of an empty box, and no Copy", () => {
    const html = bodyHtml({ kind: "empty" });
    expect(html).toContain(RESET_PROMPT_EMPTY);
    expect(RESET_PROMPT_EMPTY).toBe("No reset instructions saved yet");
    // No block, nothing to copy.
    expect(html).not.toContain("reset-prompt-text");
    expect(html).not.toContain("reset-prompt-copy");
    expect(html).not.toContain("<pre");
  });

  test("a read failure shows its own line, flagged to readers, and no Copy", () => {
    const html = bodyHtml({ kind: "failed" });
    expect(html).toContain(RESET_PROMPT_FAILED);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("reset-prompt-copy");
  });

  test("loading shows a loading line and nothing to copy", () => {
    const html = bodyHtml({ kind: "loading" });
    expect(html).toContain("Loading the instructions");
    expect(html).not.toContain("reset-prompt-copy");
  });
});

describe("the dialog", () => {
  test("it opens titled, with the reassurance line that it deletes nothing", () => {
    const html = dialogHtml();
    expect(html).toContain(`id="reset-prompt-title">${RESET_PROMPT_TITLE}</p>`);
    expect(html).toContain(RESET_PROMPT_INTRO);
    // The required line says plainly that nothing is deleted here, and points
    // at the chat the callout named.
    expect(RESET_PROMPT_INTRO).toContain("does not delete anything");
    expect(RESET_PROMPT_INTRO).toContain("in that chat");
    // Proper dialog semantics and a Close control.
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="reset-prompt-title"');
    expect(html).toContain('<button type="button" class="match-cancel">Close</button>');
  });

  test("a prominent callout at the top says where to run the prompt", () => {
    const html = dialogHtml();
    // The exact words asked for, naming the Touch Points project.
    expect(RESET_PROMPT_CALLOUT).toBe(
      "Run this prompt in a Claude chat within the Touch Points project.",
    );
    expect(html).toContain(RESET_PROMPT_CALLOUT);
    // Carried in its own emphasised element, not the plain sub.
    expect(html).toContain(`<p class="reset-prompt-callout">${RESET_PROMPT_CALLOUT}</p>`);
    // The reassurance is the plainer, lighter sub directly below the callout.
    expect(html).toContain(`<p class="match-panel-sub">${RESET_PROMPT_INTRO}</p>`);
    // Order: title, then the callout, then the reassurance, then the body
    // (loading here, so the status line), then Close. The prompt block and
    // Copy button live in that body, below the callout.
    const title = html.indexOf('id="reset-prompt-title"');
    const callout = html.indexOf('class="reset-prompt-callout"');
    const reassurance = html.indexOf('class="match-panel-sub"');
    const body = html.indexOf('class="reset-prompt-status"');
    const close = html.indexOf("match-cancel");
    for (const at of [title, callout, reassurance, body, close]) expect(at).toBeGreaterThan(-1);
    expect(title).toBeLessThan(callout);
    expect(callout).toBeLessThan(reassurance);
    expect(reassurance).toBeLessThan(body);
    expect(body).toBeLessThan(close);
  });

  test("it reads reset_prompt and only reads, never writes or deletes", () => {
    // The one read is the single column from the single row.
    expect(DIALOG_SOURCE).toContain('.select("reset_prompt")');
    expect(DIALOG_SOURCE).toContain('.eq("id", RESET_SETTINGS_ROW_ID)');
    // Display and copy only: no write path of any kind, here or in the words.
    for (const file of [DIALOG_SOURCE, LIB_SOURCE]) {
      expect(file).not.toContain(".insert(");
      expect(file).not.toContain(".update(");
      expect(file).not.toContain(".delete(");
      expect(file).not.toContain(".upsert(");
    }
    // The only table it touches is the settings row, and only to select.
    expect([...DIALOG_SOURCE.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual([
      "daily_notes_settings",
    ]);
  });

  test("Escape closes and focus returns to the opener, reusing the picker's wiring", () => {
    const pieces = [
      'document.addEventListener("keydown", onKey)',
      'if (event.key === "Escape") onClose();',
      "openerRef.current = document.activeElement;",
      "if (opener instanceof HTMLElement) opener.focus();",
    ];
    for (const piece of pieces) {
      expect(DIALOG_SOURCE).toContain(piece);
      expect(PICKER_SOURCE).toContain(piece);
    }
    expect(DIALOG_SOURCE).toContain('document.removeEventListener("keydown", onKey)');
    // The focus return is the effect's cleanup, which is what runs it on close.
    const effect = DIALOG_SOURCE.slice(
      DIALOG_SOURCE.indexOf("openerRef.current = document.activeElement;"),
    );
    expect(effect.slice(0, 220)).toContain("return () => {");
    expect(effect.slice(0, 220)).toContain("opener.focus()");
  });

  test("the Copy button uses the Templates copy helper and revert", () => {
    expect(DIALOG_SOURCE).toContain('import { copyText } from "../lib/clipboard"');
    expect(DIALOG_SOURCE).toContain("setCopied(ok)");
    expect(DIALOG_SOURCE).toContain("window.setTimeout(() => setCopied(false), 1500)");
    expect(source("../components/TemplatePanel.tsx")).toContain(
      "window.setTimeout(() => setCopied(false), 1500)",
    );
  });
});

describe("the red button on the Parents strip", () => {
  test("the Parents dashboard shows a red 2 Reset term button when unlocked", () => {
    const html = trackerHtml("unlocked");
    expect(html).toContain("2 Reset term");
    // A real button carrying the destructive red variant.
    const at = html.indexOf("2 Reset term");
    const openTag = html.lastIndexOf("<button", at);
    const tag = html.slice(openTag, at);
    expect(tag).toContain("eot-strip-button-danger");
    expect(tag).toContain('type="button"');
    // It is the second action in the strip, after Re-enrol analysis.
    const strip = html.indexOf('class="eot-strip"');
    const reenrol = html.indexOf("1 Re-enrol analysis");
    expect(strip).toBeGreaterThan(-1);
    expect(reenrol).toBeGreaterThan(strip);
    expect(at).toBeGreaterThan(reenrol);
  });

  test("the two cards are gone from Settings", () => {
    const settings = settingsHtml("unlocked");
    expect(settings).not.toContain(RESET_PROMPT_BUTTON_LABEL);
    expect(settings).not.toContain("2 Reset term");
    expect(settings).not.toContain("reset-prompt-button");
    expect(settings).not.toContain("button-danger");
    // The wiring left Settings and now lives on the tracker.
    expect(SETTINGS_SOURCE).not.toContain("setResetOpen");
    expect(SETTINGS_SOURCE).not.toContain("ResetPromptDialog");
    expect(TRACKER_SOURCE).toContain("setResetOpen(true)");
    expect(TRACKER_SOURCE).toContain("ResetPromptDialog onClose");
  });

  test("it only shows once the Parents PIN is entered", () => {
    // Every locked state falls to the Parents lock gate, so no strip shows.
    for (const state of ["checking", "setup", "locked", "failed"]) {
      const html = trackerHtml(state);
      expect(html).not.toContain("2 Reset term");
      expect(html).not.toContain('class="eot-strip"');
    }
    // The strip sits below the unlock gate's early return.
    const guard = TRACKER_SOURCE.indexOf("if (!unlocked)");
    expect(guard).toBeGreaterThan(-1);
    expect(TRACKER_SOURCE.indexOf('className="eot-strip"')).toBeGreaterThan(guard);
  });

  test("the button opens the dialog through its own flag", () => {
    expect(TRACKER_SOURCE).toContain("onClick={() => setResetOpen(true)}");
    expect(TRACKER_SOURCE).toContain(
      "{resetOpen ? <ResetPromptDialog onClose={() => setResetOpen(false)} /> : null}",
    );
    // Its own flag, separate from the re-enrol help flag beside it.
    expect(TRACKER_SOURCE).toContain("const [resetOpen, setResetOpen] = useState(false)");
    expect(TRACKER_SOURCE).toContain("const [helpOpen, setHelpOpen] = useState(false)");
  });

  test("the red is the destructive red the app already uses, not a new colour", () => {
    // The strip's red variant draws on the same danger token button-danger
    // uses, which is the tracker's own destructive confirmations.
    expect(source("../styles.css")).toContain(".button-danger {");
    expect(source("../styles.css")).toContain(".eot-strip-button-danger {");
    expect(source("../styles.css")).toContain("background: var(--badge-danger-text)");
    expect(source("../components/MismatchPanel.tsx")).toContain("button-danger");
    // No hex anywhere in the new code: colour comes only from tokens.
    for (const file of [DIALOG_SOURCE, LIB_SOURCE]) {
      expect(file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("the house rules", () => {
  test("no em dash, no en dash and no spaced hyphen in the words on screen", () => {
    const words = [
      RESET_PROMPT_BUTTON_LABEL,
      RESET_PROMPT_TITLE,
      RESET_PROMPT_CALLOUT,
      RESET_PROMPT_INTRO,
      RESET_PROMPT_EMPTY,
      RESET_PROMPT_FAILED,
    ];
    for (const piece of words) {
      expect(piece).not.toContain(EM_DASH);
      expect(piece).not.toContain(EN_DASH);
      expect(piece).not.toContain(" - ");
    }
    // The rendered markup and both source files too, comments included.
    for (const file of [dialogHtml(), bodyHtml({ kind: "empty" }), DIALOG_SOURCE, LIB_SOURCE]) {
      expect(file).not.toContain(EM_DASH);
      expect(file).not.toContain(EN_DASH);
    }
  });

  test("the business name is nowhere in the new code", () => {
    const all = [DIALOG_SOURCE, LIB_SOURCE, dialogHtml(), settingsHtml("unlocked")]
      .join(" ")
      .toLowerCase();
    for (const name of ["numberworks", "nwords", "number works", "miranda", "'nwords"]) {
      expect(all).not.toContain(name);
    }
  });
});
