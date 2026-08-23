import { describe, expect, it } from "bun:test";
import {
  CHOICE_REASONS,
  NEEDS_NOTE_NOTE,
  canFill,
  choiceOf,
  fillAll,
  fillTemplate,
  findChoice,
  firstNameOf,
  recommend,
  ruleChoice,
  subjectAndBody,
  type FamilyFacts,
  type TemplateChoice,
} from "./reengage";
import type { ReengagementTemplate } from "./reengagement";

function template(
  name: string,
  needs_detail: boolean,
  over: Partial<ReengagementTemplate> = {},
): ReengagementTemplate {
  return {
    id: name,
    key: name.toLowerCase().replace(/[^a-z]+/g, "-"),
    name,
    when_to_use: "When it fits.",
    needs_detail,
    email_subject: "About {student_name}",
    email_body: "Hi {parent_first_name}, {student_name} did well. {detail}",
    sms_body: "Hi {parent_first_name}, about {student_name}.",
    sort_order: 1,
    ...over,
  };
}

// Which of the five need a detail is what makes the fallback chain matter.
const ALL: ReengagementTemplate[] = [
  template("The heads up", false),
  template("The specific win", true),
  template("The one thing", false),
  template("The check in", false),
  template("Good news, no strings", true),
];

const BASE: FamilyFacts = {
  assessmentSoon: null,
  engagementLevel: "warm",
  hasEmailed: true,
  daysSinceLast: 3,
  p2Done: false,
  hasDetail: true,
};

const facts = (over: Partial<FamilyFacts> = {}): FamilyFacts => ({ ...BASE, ...over });

describe("matching a row to one of the five", () => {
  it("matches on the name however it is punctuated", () => {
    expect(choiceOf(template("The heads up", false))).toBe("heads-up");
    expect(choiceOf(template("Good news, no strings", true))).toBe("good-news");
    expect(choiceOf(template("THE CHECK IN", false))).toBe("check-in");
  });

  it("matches on the key when the name does not", () => {
    expect(choiceOf(template("Something else", false, { key: "the-one-thing" }))).toBe("one-thing");
  });

  it("gives nothing for a row it does not recognise", () => {
    expect(choiceOf(template("Birthday note", false, { key: "birthday" }))).toBeNull();
  });

  it("finds a named template in the list", () => {
    expect(findChoice(ALL, "one-thing")?.name).toBe("The one thing");
    expect(findChoice([], "one-thing")).toBeNull();
  });
});

describe("which template can be filled", () => {
  it("allows one that needs no detail either way", () => {
    expect(canFill(template("The one thing", false), false)).toBe(true);
    expect(canFill(template("The one thing", false), true)).toBe(true);
  });

  it("blocks one that needs a detail when there is none", () => {
    expect(canFill(template("The specific win", true), false)).toBe(false);
    expect(canFill(template("The specific win", true), true)).toBe(true);
  });
});

describe("the recommendation rules, in order", () => {
  it("skips the assessment rule entirely while assessments are unknown", () => {
    // Null means the screen cannot see assessments, which is today. The
    // rule is skipped rather than guessed either way.
    expect(ruleChoice(facts({ assessmentSoon: null }))).not.toBe("heads-up");
    expect(ruleChoice(facts({ assessmentSoon: false }))).not.toBe("heads-up");
  });

  it("takes the heads up when an assessment is coming", () => {
    expect(ruleChoice(facts({ assessmentSoon: true }))).toBe("heads-up");
    // And it beats every rule below it.
    expect(ruleChoice(facts({ assessmentSoon: true, hasEmailed: false, p2Done: true }))).toBe(
      "heads-up",
    );
  });

  it("takes the specific win for a family who spoke then went quiet", () => {
    expect(
      ruleChoice(facts({ engagementLevel: "warm", hasEmailed: true, daysSinceLast: 21 })),
    ).toBe("specific-win");
    expect(
      ruleChoice(facts({ engagementLevel: "cold", hasEmailed: true, daysSinceLast: 60 })),
    ).toBe("specific-win");
  });

  it("does not take the specific win before three weeks have passed", () => {
    expect(
      ruleChoice(facts({ engagementLevel: "warm", hasEmailed: true, daysSinceLast: 20 })),
    ).not.toBe("specific-win");
  });

  it("does not take the specific win when the level is Nothing", () => {
    expect(
      ruleChoice(facts({ engagementLevel: "none", hasEmailed: true, daysSinceLast: 40 })),
    ).not.toBe("specific-win");
  });

  it("takes the one thing when the parent has never emailed", () => {
    expect(ruleChoice(facts({ hasEmailed: false, daysSinceLast: null }))).toBe("one-thing");
    // And beats the check in below it.
    expect(
      ruleChoice(
        facts({ hasEmailed: false, daysSinceLast: null, p2Done: true, engagementLevel: "cold" }),
      ),
    ).toBe("one-thing");
  });

  it("takes the check in when the P2 is done and the family has cooled", () => {
    for (const level of ["cooling", "cold"] as const) {
      expect(ruleChoice(facts({ p2Done: true, engagementLevel: level }))).toBe("check-in");
    }
  });

  it("does not take the check in when the P2 is not done", () => {
    expect(ruleChoice(facts({ p2Done: false, engagementLevel: "cold" }))).toBe("good-news");
  });

  it("does not take the check in at a warmer level", () => {
    expect(ruleChoice(facts({ p2Done: true, engagementLevel: "engaged" }))).toBe("good-news");
  });

  it("falls to good news in every other case", () => {
    expect(ruleChoice(facts())).toBe("good-news");
  });

  it("gives a plain reason for whichever fired", () => {
    for (const choice of Object.keys(CHOICE_REASONS) as TemplateChoice[]) {
      expect(CHOICE_REASONS[choice].length).toBeGreaterThan(10);
      expect(CHOICE_REASONS[choice]).not.toContain("{");
    }
  });
});

describe("what is actually recommended once availability is considered", () => {
  it("recommends the rule's own answer when it can be filled", () => {
    const found = recommend(ALL, facts({ hasEmailed: false, daysSinceLast: null }));
    expect(found?.choice).toBe("one-thing");
    expect(found?.why).toBe(CHOICE_REASONS["one-thing"]);
  });

  it("falls to good news when the rule's answer needs a detail there is none of", () => {
    // The specific win needs a detail. Without one it cannot be used.
    const found = recommend(
      [template("The specific win", true), template("Good news, no strings", false)],
      facts({ engagementLevel: "warm", hasEmailed: true, daysSinceLast: 30, hasDetail: false }),
    );
    expect(found?.choice).toBe("good-news");
  });

  it("falls on to the one thing when good news cannot be filled either", () => {
    // This is the case the brief calls out: only the templates needing no
    // detail are left, and good news is not one of them.
    const found = recommend(ALL, facts({ hasDetail: false }));
    expect(ruleChoice(facts({ hasDetail: false }))).toBe("good-news");
    expect(found?.choice).toBe("one-thing");
    expect(found?.template.needs_detail).toBe(false);
  });

  it("recommends nothing at all when no template can be filled", () => {
    const onlyDetail = [
      template("The specific win", true),
      template("Good news, no strings", true),
    ];
    expect(recommend(onlyDetail, facts({ hasDetail: false }))).toBeNull();
  });

  it("never recommends a template it cannot fill", () => {
    for (const hasDetail of [true, false]) {
      for (const level of ["none", "cold", "cooling", "warm", "engaged", "very"] as const) {
        for (const hasEmailed of [true, false]) {
          const found = recommend(
            ALL,
            facts({
              hasDetail,
              engagementLevel: level,
              hasEmailed,
              daysSinceLast: hasEmailed ? 40 : null,
            }),
          );
          if (found) expect(canFill(found.template, hasDetail)).toBe(true);
        }
      }
    }
  });

  it("takes anything fillable when none of the five names match", () => {
    const odd = [template("Birthday note", false, { key: "birthday" })];
    expect(recommend(odd, facts())?.template.name).toBe("Birthday note");
    expect(recommend([], facts())).toBeNull();
  });
});

describe("filling the wording in", () => {
  const values = {
    parentName: "sarah mcleod",
    studentName: "charlie smith",
    detail: "He read a whole chapter.",
  };

  it("uses the first word of each name, capitalised", () => {
    expect(firstNameOf("sarah mcleod")).toBe("Sarah");
    expect(firstNameOf("  charlie  smith ")).toBe("Charlie");
    expect(firstNameOf("Wei")).toBe("Wei");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf("")).toBe("");
  });

  it("replaces every placeholder, leaving no curly brackets behind", () => {
    const filled = fillAll(ALL[1]!, values);
    for (const text of [filled.subject, filled.body, filled.sms]) {
      expect(text).not.toContain("{");
      expect(text).not.toContain("}");
    }
    expect(filled.body).toBe("Hi Sarah, Charlie did well. He read a whole chapter.");
    expect(filled.subject).toBe("About Charlie");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(fillTemplate("{student_name} and {student_name}", values)).toBe("Charlie and Charlie");
  });

  it("leaves no brackets behind even when a value is missing", () => {
    const filled = fillAll(ALL[1]!, { parentName: null, studentName: null, detail: null });
    for (const text of [filled.subject, filled.body, filled.sms]) {
      expect(text).not.toContain("{");
      expect(text).not.toContain("}");
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("null");
    }
  });

  it("keeps the line breaks in the body", () => {
    expect(fillTemplate("One\n\nTwo {student_name}", values)).toBe("One\n\nTwo Charlie");
  });

  it("puts the subject first, then a blank line, then the body, for copy all", () => {
    const filled = { subject: "About Charlie", body: "Hi Sarah,\n\nAll good.", sms: "x" };
    expect(subjectAndBody(filled)).toBe("About Charlie\n\nHi Sarah,\n\nAll good.");
  });
});

describe("nothing here writes anything", () => {
  it("exports no function that could reach the database", () => {
    // Everything in this module is pure: it takes what it is given and
    // returns wording. The panel copies it and nothing more.
    const source = require("node:fs").readFileSync(
      new URL("./reengage.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    for (const forbidden of [
      "supabase",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "fetch(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("the panel itself", () => {
  const panelSource = require("node:fs").readFileSync(
    new URL("../components/ReengagePanel.tsx", import.meta.url).pathname,
    "utf8",
  ) as string;

  it("creates no draft, sends nothing and writes nothing", () => {
    for (const forbidden of [
      "supabase",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "fetch(",
    ]) {
      expect(panelSource).not.toContain(forbidden);
    }
  });

  it("copies through the shared helper, which has a fallback", () => {
    expect(panelSource).toContain("copyText");
    expect(panelSource).not.toContain("navigator.clipboard");
  });

  it("says the same thing about a missing note as the rules do", () => {
    expect(panelSource).toContain("NEEDS_NOTE_NOTE");
    expect(panelSource).toContain("NOTHING_AVAILABLE_NOTE");
    expect(NEEDS_NOTE_NOTE).toBe("needs a recent note about this student");
  });

  it("is reachable from the student row menu", () => {
    const screenSource = require("node:fs").readFileSync(
      new URL("../components/TrackerScreen.tsx", import.meta.url).pathname,
      "utf8",
    ) as string;
    expect(screenSource).toContain("Draft a re-engagement email");
    expect(screenSource).toContain("<ReengagePanel");
  });
});
