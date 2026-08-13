import { describe, expect, it } from "bun:test";
import {
  CONTACT_METHODS,
  OUTCOMES_BY_METHOD,
  TOUCH_POINT_METHOD,
  deriveStatus,
  isP2Done,
  isTouchPointEntry,
  latestPerStudent,
  latestStatusEntryPerStudent,
} from "./p2";

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

  it("maps the other methods to their own statuses, none of them done", () => {
    const expected: Record<string, string> = {
      "SMS only": "sms",
      "Email No Report": "email",
      "Email Full Report": "report",
    };
    for (const [method, want] of Object.entries(expected)) {
      const status = deriveStatus({ method, outcome: "Sent" });
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
    for (const method of CONTACT_METHODS) {
      for (const outcome of OUTCOMES_BY_METHOD[method]) {
        const newerStatus = deriveStatus({ method, outcome });
        if (isP2Done(newerStatus)) continue;
        const logs = [
          { student_id: 1, method, outcome },
          { student_id: 1, method: "FULL P2", outcome: "Reached" },
        ];
        const latest = latestPerStudent(logs);
        expect(isP2Done(deriveStatus(latest.get("1")))).toBe(false);
      }
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

  it("never lets a touch point change a derived status", () => {
    // Every real status, then the same student with a newer touch point.
    for (const method of CONTACT_METHODS) {
      for (const outcome of OUTCOMES_BY_METHOD[method]) {
        const logs = [
          { student_id: 1, method: TOUCH_POINT_METHOD, outcome: "Noted" },
          { student_id: 1, method, outcome },
        ];
        const withTouch = latestStatusEntryPerStudent(logs);
        const withoutTouch = latestPerStudent([logs[1]!]);
        expect(deriveStatus(withTouch.get("1"))).toBe(deriveStatus(withoutTouch.get("1")));
      }
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
  it("derives a status for every method and outcome pair in the vocabulary", () => {
    for (const method of CONTACT_METHODS) {
      for (const outcome of OUTCOMES_BY_METHOD[method]) {
        expect(deriveStatus({ method, outcome })).not.toBe("none");
      }
    }
  });

  it("marks exactly the two documented pairs as done across the whole vocabulary", () => {
    const donePairs: string[] = [];
    for (const method of CONTACT_METHODS) {
      for (const outcome of OUTCOMES_BY_METHOD[method]) {
        if (isP2Done(deriveStatus({ method, outcome }))) {
          donePairs.push(`${method}/${outcome}`);
        }
      }
    }
    expect(donePairs.sort()).toEqual(["FULL P2/Reached", "Low Risk Parent/Noted"]);
  });
});
