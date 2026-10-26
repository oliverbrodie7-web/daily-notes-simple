// The next term reset instructions.
//
// This is display and copy only. It reads one column, reset_prompt, from the
// single daily_notes_settings row, and shows whatever text is saved there so
// it can be copied into a separate chat. It never deletes anything, never
// writes anything, and runs no SQL of its own. The instruction text is not
// held in the code: it is typed into the column by hand, so the only strings
// here are the labels around it.

// The settings table holds exactly one row whose id is always 1.
export const RESET_SETTINGS_ROW_ID = 1;

// The exact words asked for, kept here so the button and the tests read from
// one place and cannot drift apart.
export const RESET_PROMPT_BUTTON_LABEL =
  "Delete and clear all parents in preparation for the next term";
export const RESET_PROMPT_CARD_HEADING = "Next term reset";
export const RESET_PROMPT_CARD_SUB =
  "Opens the saved reset instructions to copy into a separate chat. It does not delete anything from this screen.";

export const RESET_PROMPT_TITLE = "Reset instructions";
// The prominent instruction above the prompt block: where to run it.
export const RESET_PROMPT_CALLOUT =
  "Run this prompt in a Claude chat within the Touch Points project.";
// The reassurance line directly under the callout, smaller and lighter.
export const RESET_PROMPT_INTRO =
  "This does not delete anything. It gives you the steps to run the reset in that chat.";
// Shown in place of an empty box when nothing is saved yet.
export const RESET_PROMPT_EMPTY = "No reset instructions saved yet";
// Shown when the column could not be read at all, which is different from it
// being empty.
export const RESET_PROMPT_FAILED = "The reset instructions could not be loaded. Please try again.";
export const RESET_PROMPT_LOADING = "Loading the instructions";

// What the panel shows: the saved text, the empty placeholder, or a read
// failure. Loading is a concern of the component alone and is not here.
export type ResetPromptLoad =
  { kind: "text"; text: string } | { kind: "empty" } | { kind: "failed" };

// Decide what the panel shows from a raw column value. Pulled out so the
// three outcomes can be checked without a database. Emptiness is judged on
// the trimmed value, so a column holding only spaces or newlines counts as
// empty rather than showing a blank box. The text itself is handed back
// exactly as stored, because it is pasted elsewhere and its own formatting
// matters.
export function resetPromptOutcome(
  value: string | null | undefined,
  error: boolean,
): ResetPromptLoad {
  if (error) return { kind: "failed" };
  if (!value || value.trim() === "") return { kind: "empty" };
  return { kind: "text", text: value };
}

// The one read the panel makes, behind an interface so the async path can be
// tested with a fake and no network. The component supplies a reader backed
// by supabase; the tests supply one that resolves to whatever they need.
export type ResetPromptReader = {
  read: () => Promise<{ value: string | null; error: boolean }>;
};

// Read the column and map it to an outcome. A reader that rejects is treated
// as a failure rather than being allowed to throw, so the panel always lands
// on one of the three states.
export async function loadResetPrompt(reader: ResetPromptReader): Promise<ResetPromptLoad> {
  try {
    const { value, error } = await reader.read();
    return resetPromptOutcome(value, error);
  } catch {
    return { kind: "failed" };
  }
}

export type ResetCopyDeps = {
  copy: (text: string) => Promise<boolean>;
};

// Copy the whole saved text, exactly as it stands. A clipboard that refuses
// rejects rather than returning, so this never assumes the promise resolves.
export async function copyResetPrompt(deps: ResetCopyDeps, text: string): Promise<boolean> {
  try {
    return await deps.copy(text);
  } catch {
    return false;
  }
}
