import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageMeter } from "../components/CoverageMeter";
import {
  COVERAGE_CAPTION,
  COVERAGE_FINISH,
  COVERAGE_HEADLINE_LABEL,
  coverageCounts,
  coverageFor,
  coverageGroup,
  coveragePaceLine,
  coverageSignals,
  coverageSignalsByStudent,
  logInTerm,
  type CoverageGroup,
  type CoverageLog,
} from "./coverage";
import { touchPointTotal } from "./touchPoints";

// The term window start the tests measure against.
const WINDOW = "2026-07-20";

function log(method: string | null, date = "2026-08-01"): CoverageLog {
  return { method, date_contacted: date, logged_at: `${date}T09:00:00Z` };
}

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

describe("the one decision", () => {
  test("a student with a FULL P2 this term is green, never teal or red", () => {
    expect(coverageFor([log("FULL P2")], WINDOW, 0)).toBe("green");
    // Case does not matter, the way the rest of the app compares methods.
    expect(coverageFor([log("full p2")], WINDOW, 0)).toBe("green");
    // Green wins even when there are touch points and other contact too.
    expect(coverageFor([log("FULL P2"), log("SMS only")], WINDOW, 9)).toBe("green");
    // But only this term: a FULL P2 before the window does not make green.
    expect(coverageFor([log("FULL P2", "2026-06-01")], WINDOW, 0)).toBe("red");
  });

  test("a student with only a Low Risk Parent log is red", () => {
    expect(coverageFor([log("Low Risk Parent")], WINDOW, 0)).toBe("red");
    // More than one attempt is still just attempts.
    expect(coverageFor([log("Low Risk Parent"), log("Low Risk Parent")], WINDOW, 0)).toBe("red");
    // A Low Risk Parent is an attempt, not contact, so it never reaches teal
    // on its own, even with an outcome that the P2 badge would call done.
    expect(coverageSignals([log("Low Risk Parent")])).toEqual({
      hasFullP2: false,
      hasOtherContact: false,
    });
  });

  test("a student with a daily_notes touch point and no P2 is teal", () => {
    // A touch point and nothing in contact_log at all.
    expect(coverageFor([], WINDOW, 1)).toBe("teal");
    // Any contact method that is not FULL P2 and not Low Risk Parent is teal.
    for (const method of ["Full Email Report", "SMS only", "Light touch", "Touch Point Email"]) {
      expect(coverageFor([log(method)], WINDOW, 0)).toBe("teal");
    }
    // A Full Email Report completes a P2 in the badge, but here it is a touch
    // point you sent, not a booking, so it is teal and not green.
    expect(coverageFor([log("Full Email Report")], WINDOW, 0)).toBe("teal");
    // A Low Risk Parent attempt plus any touch point lifts red to teal.
    expect(coverageFor([log("Low Risk Parent")], WINDOW, 1)).toBe("teal");
  });

  test("red is only ever the absence of both", () => {
    expect(coverageGroup({ hasFullP2: false, hasOtherContact: false }, 0)).toBe("red");
    expect(coverageGroup({ hasFullP2: false, hasOtherContact: true }, 0)).toBe("teal");
    expect(coverageGroup({ hasFullP2: false, hasOtherContact: false }, 1)).toBe("teal");
    expect(coverageGroup({ hasFullP2: true, hasOtherContact: false }, 0)).toBe("green");
  });

  test("a row with no method at all is not counted as contact", () => {
    expect(coverageFor([log(null)], WINDOW, 0)).toBe("red");
    expect(coverageFor([log("   ")], WINDOW, 0)).toBe("red");
  });
});

describe("this term scoping", () => {
  test("a row on or after the window start is in the term, earlier is not", () => {
    expect(logInTerm(log("FULL P2", "2026-07-20"), WINDOW)).toBe(true);
    expect(logInTerm(log("FULL P2", "2026-07-19"), WINDOW)).toBe(false);
    // With no contact date it falls back to the logged time.
    expect(
      logInTerm(
        { method: "FULL P2", date_contacted: null, logged_at: "2026-09-01T00:00:00Z" },
        WINDOW,
      ),
    ).toBe(true);
    expect(logInTerm({ method: "FULL P2", date_contacted: null, logged_at: null }, WINDOW)).toBe(
      false,
    );
  });
});

describe("the three counts", () => {
  test("they sum to the number of active students, because each is in one group", () => {
    const students = ["s1", "s2", "s3", "s4", "s5"];
    const byStudent = coverageSignalsByStudent(
      [
        { student_id: "s1", ...log("FULL P2") }, // green
        { student_id: "s2", ...log("Low Risk Parent") }, // red, no touch point
        { student_id: "s3", ...log("Full Email Report") }, // teal
        { student_id: "s4", ...log("FULL P2", "2026-06-01") }, // out of term, red
      ],
      WINDOW,
    );
    // s5 has only a quick email or a note, so a touch point and nothing logged.
    const touchPoints: Record<string, number> = { s5: 2 };
    const groups: CoverageGroup[] = students.map((id) =>
      coverageGroup(
        byStudent.get(id) ?? { hasFullP2: false, hasOtherContact: false },
        touchPoints[id] ?? 0,
      ),
    );
    expect(groups).toEqual(["green", "red", "teal", "red", "teal"]);

    const counts = coverageCounts(groups);
    expect(counts).toEqual({ green: 1, teal: 2, red: 2, total: 5 });
    expect(counts.green + counts.teal + counts.red).toBe(students.length);
    expect(counts.total).toBe(students.length);
  });

  test("an empty roster is three zeroes that sum to zero", () => {
    const counts = coverageCounts([]);
    expect(counts).toEqual({ green: 0, teal: 0, red: 0, total: 0 });
  });
});

describe("the shared touch point count", () => {
  test("adds one for a quick email, so the table column and the meter agree", () => {
    expect(touchPointTotal(0, false)).toBe(0);
    expect(touchPointTotal(0, true)).toBe(1);
    expect(touchPointTotal(3, false)).toBe(3);
    expect(touchPointTotal(3, true)).toBe(4);
  });

  test("the screen builds both the column and the meter from this one count", () => {
    const tracker = source("../components/TrackerScreen.tsx");
    // The decorated row's touchPoints is the shared count.
    expect(tracker).toContain(
      "touchPointTotal(baseTouchPoints, quickEmailIds.has(String(student.id)))",
    );
    // The table reads that same row value rather than recomputing.
    expect(tracker).toContain("const touchCount = touchPoints;");
    // And coverage is derived from that same shared count.
    expect(tracker).toContain("coverageGroup(");
  });
});

describe("the meter", () => {
  function meterHtml(
    counts: { green: number; teal: number; red: number; total: number },
    weeksLeft = 8,
  ): string {
    return renderToStaticMarkup(
      createElement(CoverageMeter, { counts, weeksLeft, activeGroup: null, onSelect: () => {} }),
    );
  }

  test("the headline equals the red count", () => {
    const html = meterHtml({ green: 10, teal: 20, red: 7, total: 37 });
    expect(html).toContain('class="coverage-headline-number">7</span>');
    expect(html).toContain(COVERAGE_HEADLINE_LABEL);
    expect(COVERAGE_HEADLINE_LABEL).toBe("families need a touch point");
    expect(html).toContain(COVERAGE_CAPTION);
    expect(COVERAGE_CAPTION).toBe("What you control this term");
  });

  test("the bar runs green then teal then red, each showing its count", () => {
    const html = meterHtml({ green: 10, teal: 20, red: 7, total: 37 });
    const green = html.indexOf("coverage-seg-green");
    const teal = html.indexOf("coverage-seg-teal");
    const red = html.indexOf("coverage-seg-red");
    expect(green).toBeGreaterThan(-1);
    expect(green).toBeLessThan(teal);
    expect(teal).toBeLessThan(red);
    // Each segment carries its own count.
    expect(html).toContain('class="coverage-seg-count">10</span>');
    expect(html).toContain('class="coverage-seg-count">20</span>');
    expect(html).toContain('class="coverage-seg-count">7</span>');
    // A zero group is hidden rather than drawn as a sliver. Read the whole
    // of that segment's opening tag, up to the end of the button element.
    const noTeal = meterHtml({ green: 5, teal: 0, red: 2, total: 7 });
    const seg = noTeal.indexOf('class="coverage-seg coverage-seg-teal');
    expect(seg).toBeGreaterThan(-1);
    const segTag = noTeal.slice(seg, noTeal.indexOf("</button>", seg));
    expect(segTag).toContain("hidden");
  });

  test("the legend names all three groups with their notes", () => {
    const html = meterHtml({ green: 1, teal: 2, red: 3, total: 6 });
    for (const [label, note] of [
      ["Has a P2", "parent booked"],
      ["Touch point sent", "you caught them"],
      ["Needs a touch point", "your job"],
    ]) {
      expect(html).toContain(label);
      expect(html).toContain(note);
    }
  });
});

describe("the pace line", () => {
  test("reads how many to go, the weeks left, and the rate that implies", () => {
    expect(coveragePaceLine(24, 7)).toBe("24 to go, 7 teaching weeks left, about 3 a week");
    // Per week is red over weeks left, rounded.
    expect(coveragePaceLine(20, 8)).toBe("20 to go, 8 teaching weeks left, about 3 a week");
    expect(coveragePaceLine(21, 7)).toBe("21 to go, 7 teaching weeks left, about 3 a week");
  });

  test("the last week reads week, not weeks", () => {
    expect(coveragePaceLine(5, 1)).toBe("5 to go, 1 teaching week left, about 5 a week");
    // Two or more keeps the plural.
    expect(coveragePaceLine(5, 2)).toBe("5 to go, 2 teaching weeks left, about 3 a week");
  });

  test("per week never drops to zero while work remains", () => {
    // One over ten weeks rounds to zero, so it is floored at one.
    expect(coveragePaceLine(1, 10)).toBe("1 to go, 10 teaching weeks left, about 1 a week");
    expect(coveragePaceLine(2, 9)).toBe("2 to go, 9 teaching weeks left, about 1 a week");
  });

  test("drops the pace when there are no weeks left, the term ended or none set", () => {
    expect(coveragePaceLine(24, 0)).toBe("24 to go");
    // A negative is treated the same as none, never shown as a rate.
    expect(coveragePaceLine(24, -2)).toBe("24 to go");
  });

  test("the meter shows the pace line under the live headline", () => {
    const html = renderToStaticMarkup(
      createElement(CoverageMeter, {
        counts: { green: 40, teal: 59, red: 24, total: 123 },
        weeksLeft: 7,
        activeGroup: null,
        onSelect: () => {},
      }),
    );
    expect(html).toContain('class="coverage-headline-number">24</span>');
    expect(html).toContain(
      '<p class="coverage-pace">24 to go, 7 teaching weeks left, about 3 a week</p>',
    );
  });

  test("with the term ended the meter shows just the count to go", () => {
    const html = renderToStaticMarkup(
      createElement(CoverageMeter, {
        counts: { green: 40, teal: 59, red: 24, total: 123 },
        weeksLeft: 0,
        activeGroup: null,
        onSelect: () => {},
      }),
    );
    expect(html).toContain('<p class="coverage-pace">24 to go</p>');
    expect(html).not.toContain("teaching weeks left");
  });
});

describe("the finish state", () => {
  function meterHtml(red: number, weeksLeft = 7): string {
    const counts = { green: 70, teal: 53, red, total: 123 - 24 + red };
    return renderToStaticMarkup(
      createElement(CoverageMeter, { counts, weeksLeft, activeGroup: null, onSelect: () => {} }),
    );
  }

  test("with red at zero the headline becomes the finish line and the pace drops", () => {
    const html = meterHtml(0);
    expect(html).toContain(COVERAGE_FINISH);
    expect(COVERAGE_FINISH).toBe("Every family has had contact");
    // No number headline, no label, no pace.
    expect(html).not.toContain("coverage-headline-number");
    expect(html).not.toContain(COVERAGE_HEADLINE_LABEL);
    expect(html).not.toContain("coverage-pace");
  });

  test("the bar is left showing green and teal, the red segment hidden", () => {
    const html = meterHtml(0);
    // Green and teal are drawn, red is zero and hidden.
    expect(html).toContain("coverage-seg-green");
    expect(html).toContain("coverage-seg-teal");
    const red = html.indexOf('class="coverage-seg coverage-seg-red');
    const redTag = html.slice(red, html.indexOf("</button>", red));
    expect(redTag).toContain("hidden");
  });

  test("one family still to go is not the finish state", () => {
    const html = meterHtml(1);
    expect(html).not.toContain(COVERAGE_FINISH);
    expect(html).toContain('class="coverage-headline-number">1</span>');
  });
});
