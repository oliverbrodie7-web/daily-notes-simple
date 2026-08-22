import { describe, expect, it } from "bun:test";
import {
  COUNTING_STARTS_DAY,
  EMPTY_ENGAGEMENT,
  FULL_WEIGHT,
  LEVEL_LABELS,
  LEVEL_SEGMENTS,
  QUIET_DAYS,
  REPLY_WEIGHT,
  VERY_QUIET_DAYS,
  beforeCounting,
  countingStart,
  engagementByEmail,
  engagementFor,
  engagementSummary,
  hasGoneQuiet,
  lastEmailLine,
  lastEmailTone,
  levelFor,
  normaliseEmail,
  weightOf,
  type ParentEmail,
} from "./engagement";

// Term 3 2026, so week 3 begins on 3 August. "Now" is fixed so every days
// ago figure in these tests is exact.
const TERM_START = "2026-07-20";
const TERM_END = "2026-09-25";
const NOW = new Date("2026-08-21T09:00:00Z");

function email(
  parent: string,
  receivedAt: string,
  is_touch_point_reply = false,
  subject: string | null = "Quick question",
): ParentEmail {
  return { parent_email: parent, received_at: receivedAt, subject, is_touch_point_reply };
}

// A date that many days before NOW, as an instant.
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function build(rows: ParentEmail[]) {
  return engagementByEmail(rows, { termStart: TERM_START, termEnd: TERM_END, now: NOW });
}

describe("what an email is worth", () => {
  it("scores an email the parent started as one", () => {
    expect(weightOf({ is_touch_point_reply: false })).toBe(1);
    expect(FULL_WEIGHT).toBe(1);
    const found = build([email("a@b.com", daysAgo(2))]);
    expect(found.get("a@b.com")?.score).toBe(1);
  });

  it("scores a touch point reply as one third", () => {
    expect(weightOf({ is_touch_point_reply: true })).toBeCloseTo(1 / 3, 10);
    expect(REPLY_WEIGHT).toBeCloseTo(1 / 3, 10);
    const found = build([email("a@b.com", daysAgo(2), true)]);
    expect(found.get("a@b.com")?.score).toBeCloseTo(1 / 3, 10);
  });

  it("treats a missing flag as an email the parent started", () => {
    expect(weightOf({ is_touch_point_reply: null })).toBe(1);
  });

  it("adds the weights together and never takes any away", () => {
    const found = build([
      email("a@b.com", daysAgo(1)),
      email("a@b.com", daysAgo(5), true),
      email("a@b.com", daysAgo(9)),
    ]);
    expect(found.get("a@b.com")?.score).toBeCloseTo(2 + 1 / 3, 10);
  });
});

describe("the first fortnight is ignored", () => {
  it("starts counting fourteen days after the term begins", () => {
    expect(COUNTING_STARTS_DAY).toBe(14);
    expect(countingStart(TERM_START)).toBe("2026-08-03");
    expect(countingStart(null)).toBeNull();
  });

  it("ignores an email received before week 3", () => {
    // 25 July is inside the term but inside the first fortnight.
    const found = build([email("a@b.com", "2026-07-25T02:00:00Z")]);
    expect(found.get("a@b.com")?.score).toBe(0);
    expect(found.get("a@b.com")?.emails).toHaveLength(0);
  });

  it("counts an email on the first day of week 3", () => {
    const found = build([email("a@b.com", "2026-08-03T02:00:00Z")]);
    expect(found.get("a@b.com")?.score).toBe(1);
  });

  it("still sees the ignored email in the last email line", () => {
    // Nothing counts, but the parent plainly did email, so the line has to
    // say so rather than claiming they never have.
    const found = build([email("a@b.com", daysAgo(30))]);
    const entry = found.get("a@b.com");
    expect(entry?.score).toBe(0);
    expect(entry?.daysSinceLast).toBe(30);
    expect(lastEmailLine(entry?.daysSinceLast ?? null)).toBe("Last email 4 weeks ago");
  });

  it("ignores email from outside the term at either end", () => {
    const found = build([
      email("a@b.com", "2026-07-19T02:00:00Z"),
      email("a@b.com", "2026-09-26T02:00:00Z"),
    ]);
    expect(found.size).toBe(0);
  });

  it("knows when today is still inside the first fortnight", () => {
    expect(beforeCounting(TERM_START, "2026-07-25")).toBe(true);
    expect(beforeCounting(TERM_START, "2026-08-02")).toBe(true);
    expect(beforeCounting(TERM_START, "2026-08-03")).toBe(false);
    expect(beforeCounting(TERM_START, "2026-08-21")).toBe(false);
    expect(beforeCounting(null, "2026-08-21")).toBe(false);
  });
});

describe("the six levels", () => {
  it("puts each total at the right level", () => {
    expect(levelFor(6)).toBe("very");
    expect(levelFor(9.5)).toBe("very");
    expect(levelFor(5.99)).toBe("engaged");
    expect(levelFor(3)).toBe("engaged");
    expect(levelFor(2.99)).toBe("warm");
    expect(levelFor(1.5)).toBe("warm");
    expect(levelFor(1.49)).toBe("cooling");
    expect(levelFor(0.5)).toBe("cooling");
    expect(levelFor(0.49)).toBe("cold");
    expect(levelFor(1 / 3)).toBe("cold");
    expect(levelFor(0)).toBe("none");
  });

  it("fills the right number of segments at each level", () => {
    expect(LEVEL_SEGMENTS).toEqual({ very: 5, engaged: 4, warm: 3, cooling: 2, cold: 1, none: 0 });
  });

  it("labels each level", () => {
    expect(LEVEL_LABELS.very).toBe("Very engaged");
    expect(LEVEL_LABELS.engaged).toBe("Engaged");
    expect(LEVEL_LABELS.warm).toBe("Warm");
    expect(LEVEL_LABELS.cooling).toBe("Cooling");
    expect(LEVEL_LABELS.cold).toBe("Cold");
    expect(LEVEL_LABELS.none).toBe("Nothing");
  });

  it("reaches each level from real emails", () => {
    const cases: [number, string][] = [
      [6, "very"],
      [4, "engaged"],
      [2, "warm"],
      [1, "cooling"],
      [0, "cold"],
    ];
    for (const [fulls, level] of cases) {
      const rows = Array.from({ length: fulls }, (_, i) => email("a@b.com", daysAgo(i + 1)));
      // One reply on its own is a third, which is Cold.
      if (fulls === 0) rows.push(email("a@b.com", daysAgo(1), true));
      expect(build(rows).get("a@b.com")?.level).toBe(level as never);
    }
    expect(build([]).size).toBe(0);
    expect(EMPTY_ENGAGEMENT.level).toBe("none");
  });
});

describe("matching a student to their emails", () => {
  it("matches after trimming and lowercasing both sides", () => {
    expect(normaliseEmail("  Anna@Example.COM ")).toBe("anna@example.com");
    expect(normaliseEmail(null)).toBe("");
    const found = build([email(" Anna@Example.COM ", daysAgo(3))]);
    expect(engagementFor("anna@example.com", found).score).toBe(1);
    expect(engagementFor("  ANNA@example.com", found).score).toBe(1);
  });

  it("gives siblings identical figures, because they share an address", () => {
    const found = build([
      email("shared@home.com", daysAgo(2)),
      email("shared@home.com", daysAgo(8)),
    ]);
    const first = engagementFor("shared@home.com", found);
    const second = engagementFor("SHARED@home.com ", found);
    expect(first.score).toBe(second.score);
    expect(first.level).toBe(second.level);
    expect(first.daysSinceLast).toBe(second.daysSinceLast);
    expect(first.emails).toHaveLength(second.emails.length);
    expect(first.score).toBe(2);
  });

  it("gives an empty engagement for a student with no email address", () => {
    const found = build([email("a@b.com", daysAgo(2))]);
    expect(engagementFor(null, found)).toEqual(EMPTY_ENGAGEMENT);
    expect(engagementFor("nobody@nowhere.com", found)).toEqual(EMPTY_ENGAGEMENT);
  });

  it("skips rows with no address or no date rather than throwing", () => {
    expect(() =>
      build([{ parent_email: null, received_at: null, subject: null, is_touch_point_reply: null }]),
    ).not.toThrow();
    expect(
      build([
        { parent_email: null, received_at: daysAgo(1), subject: null, is_touch_point_reply: null },
      ]).size,
    ).toBe(0);
  });
});

describe("the line saying how long since the last email", () => {
  it("words each stretch plainly", () => {
    expect(lastEmailLine(null)).toBe("Never emailed");
    expect(lastEmailLine(0)).toBe("Emailed today");
    expect(lastEmailLine(1)).toBe("Emailed 1 day ago");
    expect(lastEmailLine(3)).toBe("Emailed 3 days ago");
    expect(lastEmailLine(6)).toBe("Emailed 6 days ago");
    expect(lastEmailLine(7)).toBe("Last email 1 week ago");
    expect(lastEmailLine(14)).toBe("Last email 2 weeks ago");
    expect(lastEmailLine(42)).toBe("Last email 6 weeks ago");
  });

  it("turns the warning colour at three weeks", () => {
    expect(QUIET_DAYS).toBe(21);
    expect(lastEmailTone(20)).toBe("faint");
    expect(lastEmailTone(21)).toBe("warning");
    expect(lastEmailTone(34)).toBe("warning");
  });

  it("turns red at five weeks", () => {
    expect(VERY_QUIET_DAYS).toBe(35);
    expect(lastEmailTone(35)).toBe("danger");
    expect(lastEmailTone(60)).toBe("danger");
  });

  it("leaves never emailed faint, because there is no silence to measure", () => {
    expect(lastEmailTone(null)).toBe("faint");
  });

  it("reads the most recent email, not the oldest", () => {
    const found = build([email("a@b.com", daysAgo(30)), email("a@b.com", daysAgo(2))]);
    expect(found.get("a@b.com")?.daysSinceLast).toBe(2);
  });
});

describe("who has gone quiet", () => {
  it("counts a parent silent for three weeks who emailed earlier", () => {
    const found = build([email("a@b.com", daysAgo(25))]);
    expect(hasGoneQuiet(found.get("a@b.com")!)).toBe(true);
  });

  it("never counts a parent who has never emailed", () => {
    // Going quiet requires having spoken first. Never emailed is the one
    // state where daysSinceLast stays null, however long the term runs.
    expect(hasGoneQuiet(EMPTY_ENGAGEMENT)).toBe(false);
    const found = build([email("someone@else.com", daysAgo(30))]);
    expect(hasGoneQuiet(engagementFor("silent@home.com", found))).toBe(false);
    expect(engagementFor("silent@home.com", found).daysSinceLast).toBeNull();
  });

  it("does not count a parent still in touch", () => {
    const found = build([email("a@b.com", daysAgo(4))]);
    expect(hasGoneQuiet(found.get("a@b.com")!)).toBe(false);
  });

  it("counts a parent whose only email was before week 3", () => {
    // It scored nothing, but they did speak this term, and then stopped.
    const found = build([email("a@b.com", "2026-07-22T02:00:00Z")]);
    expect(found.get("a@b.com")?.emails).toHaveLength(0);
    expect(found.get("a@b.com")?.score).toBe(0);
    expect(hasGoneQuiet(found.get("a@b.com")!)).toBe(true);
  });
});

describe("the sentence at the foot of the panel", () => {
  it("says so plainly when there is nothing", () => {
    expect(engagementSummary(EMPTY_ENGAGEMENT)).toBe("This parent has not emailed us this term.");
  });

  it("names the stretch when a parent has gone very quiet", () => {
    // A longer term, so a six week silence still sits inside it.
    const found = engagementByEmail([email("a@b.com", daysAgo(42))], {
      termStart: "2026-06-01",
      termEnd: TERM_END,
      now: NOW,
    });
    expect(engagementSummary(found.get("a@b.com")!)).toBe("Has not been in touch for 6 weeks.");
  });

  it("says so when the only contact was in the first fortnight", () => {
    const found = build([email("a@b.com", daysAgo(28))]);
    expect(found.get("a@b.com")?.emails).toHaveLength(0);
    expect(engagementSummary(found.get("a@b.com")!)).toBe(
      "Quiet for 4 weeks after being in touch earlier in the term.",
    );
  });

  it("describes a parent in touch most weeks", () => {
    const rows = Array.from({ length: 7 }, (_, i) => email("a@b.com", daysAgo(i + 1)));
    expect(engagementSummary(build(rows).get("a@b.com")!)).toBe(
      "In touch most weeks, and usually starts the conversation.",
    );
  });

  it("says when a parent only ever replies", () => {
    const rows = Array.from({ length: 2 }, (_, i) => email("a@b.com", daysAgo(i + 1), true));
    expect(engagementSummary(build(rows).get("a@b.com")!)).toBe("Only ever replies, never starts.");
  });
});

describe("the emails listed in the panel", () => {
  it("lists them newest first", () => {
    const found = build([
      email("a@b.com", daysAgo(9), false, "Third"),
      email("a@b.com", daysAgo(1), false, "First"),
      email("a@b.com", daysAgo(5), false, "Second"),
    ]);
    expect(found.get("a@b.com")?.emails.map((e) => e.subject)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("carries the weight on each one, for the Full or A third tag", () => {
    const found = build([email("a@b.com", daysAgo(1)), email("a@b.com", daysAgo(2), true)]);
    const weights = found.get("a@b.com")?.emails.map((e) => e.weight) ?? [];
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBeCloseTo(1 / 3, 10);
  });

  it("leaves out the emails that did not count", () => {
    const found = build([
      email("a@b.com", "2026-07-25T02:00:00Z", false, "Timetable"),
      email("a@b.com", daysAgo(1), false, "Counted"),
    ]);
    expect(found.get("a@b.com")?.emails.map((e) => e.subject)).toEqual(["Counted"]);
  });
});
