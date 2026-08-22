import { describe, expect, it } from "bun:test";
import { TERM_RUNWAY_DAYS, lastTermEnd, pickTermForDate, termWarning, termWeek } from "./terms";

// Two consecutive terms with a holiday between them, plus a third later on.
const TERMS = [
  {
    term_name: "Term 3 2026",
    term_start_date: "2026-07-13",
    term_end_date: "2026-09-18",
    p2_deadline: "2026-08-28",
  },
  {
    term_name: "Term 4 2026",
    term_start_date: "2026-10-06",
    term_end_date: "2026-12-18",
    p2_deadline: "2026-11-20",
  },
  {
    term_name: "Term 1 2027",
    term_start_date: "2027-01-28",
    term_end_date: "2027-04-01",
    p2_deadline: "2027-03-12",
  },
];

describe("picking the term by today's date", () => {
  it("picks the term today falls inside", () => {
    expect(pickTermForDate(TERMS, "2026-08-12")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate(TERMS, "2026-11-02")?.term_name).toBe("Term 4 2026");
  });

  it("includes both the first and the last day of a term", () => {
    expect(pickTermForDate(TERMS, "2026-07-13")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate(TERMS, "2026-09-18")?.term_name).toBe("Term 3 2026");
  });

  it("holds the term that just finished through the holidays between terms", () => {
    // The September break sits between Term 3 and Term 4.
    expect(pickTermForDate(TERMS, "2026-09-19")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate(TERMS, "2026-09-30")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate(TERMS, "2026-10-05")?.term_name).toBe("Term 3 2026");
    // The summer break sits between Term 4 and Term 1 next year.
    expect(pickTermForDate(TERMS, "2027-01-10")?.term_name).toBe("Term 4 2026");
  });

  it("picks none once today is past every term, so the fallback takes over", () => {
    expect(pickTermForDate(TERMS, "2027-04-02")).toBeNull();
    expect(pickTermForDate(TERMS, "2030-01-01")).toBeNull();
  });

  it("picks none before the first term has started", () => {
    // Nothing has finished yet, so there is no term to hold.
    expect(pickTermForDate(TERMS, "2026-07-01")).toBeNull();
  });

  it("ignores the is_active flag entirely", () => {
    // Every flag points at the wrong term, which must change nothing.
    const flagged = TERMS.map((term) => ({
      ...term,
      is_active: term.term_name === "Term 1 2027",
    }));
    expect(pickTermForDate(flagged, "2026-08-12")?.term_name).toBe("Term 3 2026");

    const allActive = TERMS.map((term) => ({ ...term, is_active: true }));
    const noneActive = TERMS.map((term) => ({ ...term, is_active: false }));
    expect(pickTermForDate(allActive, "2026-08-12")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate(noneActive, "2026-08-12")?.term_name).toBe("Term 3 2026");
  });

  it("takes the latest start when terms overlap", () => {
    const overlapping = [
      { ...TERMS[0]!, term_name: "Older", term_start_date: "2026-07-01" },
      { ...TERMS[0]!, term_name: "Newer", term_start_date: "2026-07-13" },
    ];
    expect(pickTermForDate(overlapping, "2026-08-12")?.term_name).toBe("Newer");
  });

  it("skips rows with a missing start or end date rather than guessing", () => {
    const broken = [
      {
        term_name: "No end",
        term_start_date: "2026-07-13",
        term_end_date: null,
        p2_deadline: null,
      },
      ...TERMS,
    ];
    expect(pickTermForDate(broken, "2026-08-12")?.term_name).toBe("Term 3 2026");
    expect(pickTermForDate([broken[0]!], "2026-08-12")).toBeNull();
  });

  it("picks none from an empty table", () => {
    expect(pickTermForDate([], "2026-08-12")).toBeNull();
  });
});

describe("the term runway warning", () => {
  it("says nothing while there is plenty of runway", () => {
    expect(termWarning(TERMS, "2026-08-12")).toBe("none");
  });

  it("warns once today is within the runway of the last term's end", () => {
    // Last term ends 2027-04-01.
    expect(termWarning(TERMS, "2027-01-02")).toBe("ending-soon");
    expect(termWarning(TERMS, "2027-03-31")).toBe("ending-soon");
  });

  it("warns exactly on the runway boundary, and not the day before it", () => {
    const boundary = "2027-01-01";
    expect(termWarning(TERMS, boundary)).toBe("ending-soon");
    expect(TERM_RUNWAY_DAYS).toBe(90);
    expect(termWarning(TERMS, "2026-12-31")).toBe("none");
  });

  it("reports expired once today is past every term", () => {
    expect(termWarning(TERMS, "2027-04-02")).toBe("expired");
  });

  it("still counts the last day of the last term as in runway, not expired", () => {
    expect(termWarning(TERMS, "2027-04-01")).toBe("ending-soon");
  });

  it("treats an empty table as expired, since nothing is set", () => {
    expect(termWarning([], "2026-08-12")).toBe("expired");
  });
});

describe("finding the last term end", () => {
  it("returns the furthest end date", () => {
    expect(lastTermEnd(TERMS)).toBe("2027-04-01");
  });

  it("returns nothing when no row carries dates", () => {
    expect(lastTermEnd([])).toBeNull();
  });
});

describe("which week of the term a date falls in", () => {
  const term = {
    term_name: "Term 3 2026",
    term_start_date: "2026-07-20",
    term_end_date: "2026-09-25",
    p2_deadline: "2026-09-11",
  };

  it("counts the start date as week one", () => {
    expect(termWeek(term, "2026-07-20")).toBe(1);
    expect(termWeek(term, "2026-07-26")).toBe(1);
  });

  it("rolls over on the seventh day", () => {
    expect(termWeek(term, "2026-07-27")).toBe(2);
    expect(termWeek(term, "2026-08-21")).toBe(5);
  });

  it("puts the P2 deadline in week eight, where it now sits", () => {
    expect(termWeek(term, "2026-09-11")).toBe(8);
  });

  it("gives nothing before the term starts or with no term", () => {
    expect(termWeek(term, "2026-07-19")).toBeNull();
    expect(termWeek(null, "2026-08-21")).toBeNull();
    expect(termWeek({ ...term, term_start_date: null }, "2026-08-21")).toBeNull();
    expect(termWeek(term, "")).toBeNull();
  });
});
