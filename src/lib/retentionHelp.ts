// The re-enrol analysis instructions, and nothing else.
//
// Every word of it is static. The analysis itself runs in Claude, through a
// saved skill, so this screen has nothing to fetch, nothing to save and
// nothing to work out. The words live here rather than inside the component
// so the wording can be checked without a DOM, the same way the rest of the
// copy in this app is.

export const RETENTION_HELP_TITLE = "How do I analyse the re-enrol data?";

// The card the button sits in. Says when the thing is needed, which the
// dialog does not, rather than repeating the dialog's first line.
export const RETENTION_HELP_CARD_HEADING = "Re-enrol analysis";
export const RETENTION_HELP_CARD_SUB =
  "Run this at the end of each term, before Supabase is cleared for the new one.";

export const RETENTION_HELP_INTRO =
  "The analysis runs in Claude, not in this app. It uses a saved skill called term-retention-report, which does the same analysis every term and builds the report in the same style.";

export type RetentionHelpStep = {
  // The bold lead in: the step itself, in three or four words.
  lead: string;
  body: string;
};

// In the order they are done. The numbers on screen come from this order
// rather than being written into each step, so a step cannot carry a number
// that disagrees with where it sits.
export const RETENTION_HELP_STEPS: readonly RetentionHelpStep[] = [
  {
    lead: "Freeze the term first.",
    body: "Supabase is cleared to take in the new term, and once it is cleared the numbers are gone. Do this before the data is wiped.",
  },
  {
    lead: "Ask Claude.",
    body: "Open a Claude chat and send the sentence below. Change the term names to suit.",
  },
  {
    lead: "Run the query yourself.",
    body: "Claude will give you a query with three dates to edit. Run it in the Supabase SQL editor and export the result as a CSV. Claude never runs SQL for you.",
  },
  {
    lead: "Upload two files.",
    body: "The CSV, and the next term's enrolment spreadsheet.",
  },
  {
    lead: "Decide any uncertain matches.",
    body: "If a child cannot be matched with confidence, Claude lists them and asks you. Nothing is guessed.",
  },
  {
    lead: "Collect the results.",
    body: "You get a snapshot spreadsheet, a visual report and a two page PDF.",
  },
] as const;

// Which step carries the example box. Step two is the one that asks Claude,
// so the sentence sits under it. Counted from one, the way the list reads.
export const RETENTION_HELP_EXAMPLE_STEP = 2;

// Copied exactly as it stands: no heading, no step number, no quotation
// marks and no trailing newline. It is pasted straight into a Claude chat.
export const RETENTION_HELP_EXAMPLE =
  "Run the term retention report. The term to measure is Term 3 and the next term is Term 4.";

export const RETENTION_HELP_NOTE =
  "Read the result as a pattern, not proof. One term is a pattern to watch. The signal becomes trustworthy once three or four terms are stacked together.";

export type RetentionCopyDeps = {
  copy: (text: string) => Promise<boolean>;
};

// What the Copy button hands over: the example sentence, on its own. No
// heading, no step number, no quotation marks, no trailing newline, and
// nothing from the step it sits under. A clipboard that refuses rejects
// rather than returning, so this never assumes the promise resolves.
export async function copyRetentionExample(deps: RetentionCopyDeps): Promise<boolean> {
  try {
    return await deps.copy(RETENTION_HELP_EXAMPLE);
  } catch {
    return false;
  }
}

// Everything the dialog puts on screen, in reading order. One list, so a
// check on the wording cannot miss a piece by forgetting to look at it.
export function retentionHelpText(): string[] {
  return [
    RETENTION_HELP_TITLE,
    RETENTION_HELP_INTRO,
    ...RETENTION_HELP_STEPS.flatMap((step) => [step.lead, step.body]),
    RETENTION_HELP_EXAMPLE,
    RETENTION_HELP_NOTE,
  ];
}
