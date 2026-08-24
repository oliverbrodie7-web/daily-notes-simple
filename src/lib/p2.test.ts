import { describe, expect, it } from "bun:test";
import {
  CONTACT_METHODS,
  OUTCOMES_BY_METHOD,
  P2_INVISIBLE_METHODS,
  TOUCH_POINT_METHOD,
  deriveStatus,
  isP2Done,
  p2Rate,
  isTouchPointEntry,
  latestPerStudent,
  latestStatusEntryPerStudent,
} from "./p2";

// Walks the whole vocabulary. A method with no outcomes still yields one
// pair with an empty outcome, which is exactly what the panel saves, so a
// future addition cannot slip through uncovered.
function everyPair(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const method of CONTACT_METHODS) {
    const outcomes = OUTCOMES_BY_METHOD[method];
    if (outcomes.length === 0) pairs.push([method, ""]);
    else for (const outcome of outcomes) pairs.push([method, outcome]);
  }
  return pairs;
}

describe("the strict P2 completion rule", () => {
  it("counts FULL P2 with Reached as complete", () => {
    const status = deriveStatus({ method: "FULL P2", outcome: "Reached" });
    expect(status).toBe("p2_complete");
    expect(isP2Done(status)).toBe(true);
  });

  it("counts Low Risk Parent with Noted as done", () => {
    const status = deriveStatus({ method: "Low Risk Parent", outcome: "Noted" });
    expect(status).toBe("low_risk");
    expect(isP2Done(status)).toBe(true);
  });

  it("renders FULL P2 without Reached as Attempted, never done", () => {
    for (const outcome of ["Voicemail", "No Answer"]) {
      const status = deriveStatus({ method: "FULL P2", outcome });
      expect(status).toBe("attempted");
      expect(isP2Done(status)).toBe(false);
    }
  });

  it("never counts a Low Risk row without Noted as done", () => {
    const status = deriveStatus({ method: "Low Risk Parent", outcome: "Sent" });
    expect(status).toBe("attempted");
    expect(isP2Done(status)).toBe(false);
  });

  it("counts Full Email Report as done on its own, whatever the outcome", () => {
    for (const outcome of ["", "Sent", "Reached", "anything at all"]) {
      const status = deriveStatus({ method: "Full Email Report", outcome });
      expect(status).toBe("email_report");
      expect(isP2Done(status)).toBe(true);
    }
  });

  it("maps the lighter methods to their own statuses, none of them done", () => {
    const expected: Record<string, string> = {
      "SMS only": "sms",
      "Light touch": "light",
      "Touch Point Email": "touch_email",
    };
    for (const [method, want] of Object.entries(expected)) {
      // These save an empty outcome, so that is what is tested.
      const status = deriveStatus({ method, outcome: "" });
      expect(status).toBe(want);
      expect(isP2Done(status)).toBe(false);
    }
  });

  it("treats missing or unknown entries as no contact", () => {
    expect(deriveStatus(undefined)).toBe("none");
    expect(deriveStatus(null)).toBe("none");
    expect(deriveStatus({ method: null, outcome: null })).toBe("none");
    expect(deriveStatus({ method: "Carrier pigeon", outcome: "Sent" })).toBe("none");
    expect(isP2Done("none")).toBe(false);
  });

  it("ignores case and surrounding spaces, matching the agents' writes", () => {
    expect(deriveStatus({ method: " full p2 ", outcome: " REACHED " })).toBe("p2_complete");
    expect(deriveStatus({ method: "LOW RISK PARENT", outcome: "noted" })).toBe("low_risk");
  });

  it("flips a previously done student back for a newer entry of every other kind", () => {
    for (const [method, outcome] of everyPair()) {
      // Touch Point Email is the one exception and has its own tests below.
      if (isTouchPointEntry({ method })) continue;
      const newerStatus = deriveStatus({ method, outcome });
      if (isP2Done(newerStatus)) continue;
      const logs = [
        { student_id: 1, method, outcome },
        { student_id: 1, method: "FULL P2", outcome: "Reached" },
      ];
      const latest = latestStatusEntryPerStudent(logs);
      expect(isP2Done(deriveStatus(latest.get("1")))).toBe(false);
    }
  });

  it("lets the most recent entry win: a newer SMS flips a done student back", () => {
    const logs = [
      { student_id: 1, method: "SMS only", outcome: "Sent" },
      { student_id: 1, method: "FULL P2", outcome: "Reached" },
      { student_id: 2, method: "Low Risk Parent", outcome: "Noted" },
    ];
    const latest = latestPerStudent(logs);
    expect(deriveStatus(latest.get("1"))).toBe("sms");
    expect(isP2Done(deriveStatus(latest.get("1")))).toBe(false);
    expect(isP2Done(deriveStatus(latest.get("2")))).toBe(true);
  });

  it("keys the latest map by student id as a string for int and uuid ids alike", () => {
    const logs = [
      { student_id: "a-uuid", method: "FULL P2", outcome: "Reached" },
      { student_id: 7, method: "Low Risk Parent", outcome: "Noted" },
    ];
    const latest = latestPerStudent(logs);
    expect(latest.get("a-uuid")).toBeDefined();
    expect(latest.get("7")).toBeDefined();
  });
});

describe("touch points stay on their own track", () => {
  it("keeps the touch point method out of the contact vocabulary", () => {
    expect(CONTACT_METHODS as readonly string[]).not.toContain(TOUCH_POINT_METHOD);
    expect(isTouchPointEntry({ method: TOUCH_POINT_METHOD })).toBe(true);
    expect(isTouchPointEntry({ method: " touch point " })).toBe(true);
    expect(isTouchPointEntry({ method: "FULL P2" })).toBe(false);
  });

  it("treats Touch Point Email as invisible to the P2 calculation", () => {
    expect(isTouchPointEntry({ method: "Touch Point Email" })).toBe(true);
    expect(isTouchPointEntry({ method: " touch point email " })).toBe(true);
    // It is in the dropdown, unlike the older notes side guard.
    expect(CONTACT_METHODS as readonly string[]).toContain("Touch Point Email");
  });

  it("never lets either invisible method change a derived status", () => {
    // Every real status, then the same student with a newer invisible entry.
    for (const invisible of P2_INVISIBLE_METHODS) {
      for (const [method, outcome] of everyPair()) {
        if (isTouchPointEntry({ method })) continue;
        const logs = [
          { student_id: 1, method: invisible, outcome: "" },
          { student_id: 1, method, outcome },
        ];
        const withTouch = latestStatusEntryPerStudent(logs);
        const withoutTouch = latestPerStudent([logs[1]!]);
        expect(deriveStatus(withTouch.get("1"))).toBe(deriveStatus(withoutTouch.get("1")));
      }
    }
  });

  it("leaves every completed kind complete when a Touch Point Email lands after it", () => {
    const completed: [string, string][] = [
      ["FULL P2", "Reached"],
      ["Full Email Report", ""],
      ["Low Risk Parent", "Noted"],
    ];
    for (const [method, outcome] of completed) {
      const logs = [
        { student_id: 1, method: "Touch Point Email", outcome: "" },
        { student_id: 1, method, outcome },
      ];
      const latest = latestStatusEntryPerStudent(logs);
      expect(isP2Done(deriveStatus(latest.get("1")))).toBe(true);
    }
  });

  it("leaves a student on P2 Complete when a newer touch point lands", () => {
    const logs = [
      { student_id: 1, method: TOUCH_POINT_METHOD, outcome: "Noted" },
      { student_id: 1, method: "FULL P2", outcome: "Reached" },
    ];
    const latest = latestStatusEntryPerStudent(logs);
    expect(deriveStatus(latest.get("1"))).toBe("p2_complete");
    expect(isP2Done(deriveStatus(latest.get("1")))).toBe(true);
  });

  it("reads No contact for a student whose only entry is a touch point", () => {
    const logs = [{ student_id: 1, method: TOUCH_POINT_METHOD, outcome: "Noted" }];
    const latest = latestStatusEntryPerStudent(logs);
    expect(latest.get("1")).toBeUndefined();
    expect(deriveStatus(latest.get("1"))).toBe("none");
    expect(isP2Done(deriveStatus(latest.get("1")))).toBe(false);
  });
});

describe("the contact vocabulary", () => {
  it("offers exactly the six methods, in order", () => {
    expect([...CONTACT_METHODS]).toEqual([
      "FULL P2",
      "Full Email Report",
      "Low Risk Parent",
      "Touch Point Email",
      "SMS only",
      "Light touch",
    ]);
  });

  it("asks for an outcome on exactly two methods", () => {
    const withOutcomes = CONTACT_METHODS.filter((method) => OUTCOMES_BY_METHOD[method].length > 0);
    expect([...withOutcomes]).toEqual(["FULL P2", "Low Risk Parent"]);
    expect([...OUTCOMES_BY_METHOD["FULL P2"]]).toEqual(["Reached", "Voicemail", "No Answer"]);
    expect([...OUTCOMES_BY_METHOD["Low Risk Parent"]]).toEqual(["Noted"]);
  });

  it("derives a status for every method and outcome pair in the vocabulary", () => {
    for (const [method, outcome] of everyPair()) {
      expect(deriveStatus({ method, outcome })).not.toBe("none");
    }
  });

  it("marks exactly the three qualifying kinds as done across the whole vocabulary", () => {
    const donePairs: string[] = [];
    for (const [method, outcome] of everyPair()) {
      if (isP2Done(deriveStatus({ method, outcome }))) {
        donePairs.push(`${method}/${outcome}`);
      }
    }
    expect(donePairs.sort()).toEqual([
      "FULL P2/Reached",
      "Full Email Report/",
      "Low Risk Parent/Noted",
    ]);
  });

  it("keeps the two existing live combinations working unchanged", () => {
    // The contact log holds only these two today: 23 and 2 rows.
    expect(isP2Done(deriveStatus({ method: "FULL P2", outcome: "Reached" }))).toBe(true);
    expect(isP2Done(deriveStatus({ method: "Low Risk Parent", outcome: "Noted" }))).toBe(true);
  });
});

describe("the progress bar percentage", () => {
  it("rounds to the nearest whole number", () => {
    expect(p2Rate(42, 162)).toBe(26);
    expect(p2Rate(81, 162)).toBe(50);
    expect(p2Rate(1, 3)).toBe(33);
    expect(p2Rate(2, 3)).toBe(67);
  });

  it("says nought when none are done", () => {
    expect(p2Rate(0, 162)).toBe(0);
  });

  it("says a hundred when every one is done", () => {
    expect(p2Rate(162, 162)).toBe(100);
    expect(p2Rate(1, 1)).toBe(100);
  });

  it("says nought rather than dividing by zero on an empty roster", () => {
    expect(p2Rate(0, 0)).toBe(0);
    expect(p2Rate(5, 0)).toBe(0);
  });

  it("never goes above a hundred or below nought", () => {
    expect(p2Rate(200, 162)).toBe(100);
    expect(p2Rate(-5, 162)).toBe(0);
  });

  it("rounds down with one still outstanding at this roster size", () => {
    // 161 of 162 is 99.4, so it reads 99 rather than claiming the term is
    // finished. Plain rounding does reach a hundred one short of the lot on a
    // roster of a thousand, which this one is nowhere near.
    expect(p2Rate(161, 162)).toBe(99);
  });
});
