// Choosing and filling a re-engagement template for one student.
//
// Nothing here writes anything. It reads the templates, reads what the
// Parents screen already knows about the family, picks the one that fits and
// fills the wording in. Sending and saving are not part of it.

import type { EngagementLevel } from "./engagement";
import { QUIET_DAYS } from "./engagement";
import {
  DETAIL_PLACEHOLDER,
  PARENT_PLACEHOLDER,
  STUDENT_PLACEHOLDER,
  type ReengagementTemplate,
} from "./reengagement";

// The five templates the rules name. Matched against a row's name or key,
// so a row can be called any of the spellings below without this needing to
// know which the table actually uses.
export type TemplateChoice = "heads-up" | "specific-win" | "one-thing" | "check-in" | "good-news";

const CHOICE_NAMES: Record<TemplateChoice, string[]> = {
  "heads-up": ["the heads up", "heads up", "headsup", "the head up"],
  "specific-win": ["the specific win", "specific win", "specificwin"],
  "one-thing": ["the one thing", "one thing", "onething"],
  "check-in": ["the check in", "check in", "checkin", "the checkin"],
  "good-news": ["good news, no strings", "good news no strings", "good news", "goodnews"],
};

function tidy(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A row matches a choice when either its name or its key reads as one of
// that choice's spellings.
export function choiceOf(template: ReengagementTemplate): TemplateChoice | null {
  const name = tidy(template.name);
  const key = tidy(template.key);
  for (const [choice, spellings] of Object.entries(CHOICE_NAMES) as [TemplateChoice, string[]][]) {
    for (const spelling of spellings) {
      const wanted = tidy(spelling);
      if (name === wanted || key === wanted) return choice;
    }
  }
  return null;
}

export function findChoice(
  templates: ReengagementTemplate[],
  choice: TemplateChoice,
): ReengagementTemplate | null {
  return templates.find((template) => choiceOf(template) === choice) ?? null;
}

// A template that asks for a detail can only be filled when there is one.
export function canFill(template: ReengagementTemplate, hasDetail: boolean): boolean {
  return template.needs_detail !== true || hasDetail;
}

export const NEEDS_NOTE_NOTE = "needs a recent note about this student";

export const NOTHING_AVAILABLE_NOTE =
  "There is no note about this student yet, so only some templates can be used. Add a note on the Today screen first.";

export type FamilyFacts = {
  // Null when assessments are not available to the screen at all, which is
  // the case today. The rule is then skipped rather than guessed at.
  assessmentSoon: boolean | null;
  engagementLevel: EngagementLevel;
  // Whether the parent has emailed at any point this term.
  hasEmailed: boolean;
  daysSinceLast: number | null;
  p2Done: boolean;
  hasDetail: boolean;
};

export const CHOICE_REASONS: Record<TemplateChoice, string> = {
  "heads-up": "there is an assessment coming up in the next fortnight",
  "specific-win": "this family was in touch earlier in the term and has gone quiet",
  "one-thing": "this parent has not emailed at all this term",
  "check-in": "the P2 is done and this family has cooled off",
  "good-news": "there is nothing pressing, so this is a warm note with no ask",
};

// Which template the rules point at, before availability is considered.
export function ruleChoice(facts: FamilyFacts): TemplateChoice {
  // Skipped entirely while assessments are not something the screen knows
  // about, rather than assumed either way.
  if (facts.assessmentSoon === true) return "heads-up";
  if (
    facts.engagementLevel !== "none" &&
    facts.hasEmailed &&
    facts.daysSinceLast !== null &&
    facts.daysSinceLast >= QUIET_DAYS
  ) {
    return "specific-win";
  }
  if (!facts.hasEmailed) return "one-thing";
  if (facts.p2Done && (facts.engagementLevel === "cooling" || facts.engagementLevel === "cold")) {
    return "check-in";
  }
  return "good-news";
}

export type Recommendation = {
  template: ReengagementTemplate;
  choice: TemplateChoice;
  why: string;
} | null;

// The rule's own answer, then Good news when that one cannot be filled,
// then The one thing when Good news cannot be filled either. Null when
// nothing at all can be used.
export function recommend(templates: ReengagementTemplate[], facts: FamilyFacts): Recommendation {
  const wanted = ruleChoice(facts);
  const order: TemplateChoice[] = [wanted, "good-news", "one-thing"];
  for (const choice of order) {
    const template = findChoice(templates, choice);
    if (template && canFill(template, facts.hasDetail)) {
      // The reason always describes the family, so a fallback still says
      // something true rather than repeating the rule that did not apply.
      return { template, choice, why: CHOICE_REASONS[choice] };
    }
  }
  // Nothing named matched, so take the first that can be filled at all.
  const anything = templates.find((template) => canFill(template, facts.hasDetail));
  if (!anything) return null;
  const choice = choiceOf(anything);
  return {
    template: anything,
    choice: choice ?? "good-news",
    why: choice ? CHOICE_REASONS[choice] : CHOICE_REASONS["good-news"],
  };
}

// The first word, capitalised. A blank name gives a blank string rather
// than the word "undefined" landing in an email.
export function firstNameOf(full: string | null | undefined): string {
  const word = (full ?? "").trim().split(/\s+/)[0] ?? "";
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export type FillValues = {
  parentName: string | null;
  studentName: string | null;
  detail: string | null;
};

export function fillTemplate(text: string | null | undefined, values: FillValues): string {
  return (text ?? "")
    .replaceAll(PARENT_PLACEHOLDER, firstNameOf(values.parentName))
    .replaceAll(STUDENT_PLACEHOLDER, firstNameOf(values.studentName))
    .replaceAll(DETAIL_PLACEHOLDER, (values.detail ?? "").trim());
}

export type FilledTemplate = {
  subject: string;
  body: string;
  sms: string;
};

export function fillAll(template: ReengagementTemplate, values: FillValues): FilledTemplate {
  return {
    subject: fillTemplate(template.email_subject, values),
    body: fillTemplate(template.email_body, values),
    sms: fillTemplate(template.sms_body, values),
  };
}

// Subject first, a blank line, then the body.
export function subjectAndBody(filled: FilledTemplate): string {
  return `${filled.subject}\n\n${filled.body}`;
}
