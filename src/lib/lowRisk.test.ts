import { describe, expect, mock, test } from "bun:test";
import {
  LOW_RISK_BLOCKED_TITLE,
  LOW_RISK_FAILED,
  LOW_RISK_METHOD,
  LOW_RISK_OUTCOME,
  LOW_RISK_SELECT,
  arrowBlocked,
  logLowRisk,
  lowRiskBlocked,
  lowRiskEntry,
  rowErrorFor,
  type LowRiskDeps,
  type LowRiskEntry,
  type RowError,
  type SavedLowRiskLog,
} from "./lowRisk";
import { CONTACT_METHODS, OUTCOMES_BY_METHOD, deriveStatus, type ContactStatus } from "./p2";

const TODAY = "2026-08-30";
const NOW = "2026-08-30T04:15:22.000Z";

const SAVED: SavedLowRiskLog = {
  id: 91,
  student_id: 7,
  method: LOW_RISK_METHOD,
  outcome: LOW_RISK_OUTCOME,
  logged_at: NOW,
  date_contacted: TODAY,
};

// A stand in for the screen: the two pieces of state the write touches, the
// one it must not, and a record of what was sent.
function screen(
  result: { data: SavedLowRiskLog | null; error: unknown } | (() => never) = {
    data: SAVED,
    error: null,
  },
) {
  const sent: LowRiskEntry[] = [];
  const state = {
    busyId: null as string | null,
    lowRiskError: null as RowError,
    // The shared string this path must never touch.
    rowMessage: "Something another row is showing" as string | null,
    saved: [] as SavedLowRiskLog[],
  };
  const save = mock(async (entry: LowRiskEntry) => {
    sent.push(entry);
    if (typeof result === "function") return result();
    return result;
  });
  const deps: LowRiskDeps = {
    busyId: () => state.busyId,
    setBusyId: (id) => {
      state.busyId = id;
    },
    save,
    onSaved: (log) => state.saved.push(log),
    setError: (error) => {
      state.lowRiskError = error;
    },
    today: () => TODAY,
    now: () => NOW,
  };
  return { deps, state, sent, save };
}

describe("the pair that gets written", () => {
  test("one tap writes method Low Risk Parent and outcome Noted together", async () => {
    const { deps, sent } = screen();
    await logLowRisk(deps, 7);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("Low Risk Parent");
    expect(sent[0]?.outcome).toBe("Noted");
    expect(typeof sent[0]?.logged_at).toBe("string");
    expect(sent[0]?.logged_at.length).toBeGreaterThan(0);
    expect(new Date(sent[0]!.logged_at).toISOString()).toBe(sent[0]!.logged_at);
  });

  test("one tap sets date_contacted from sydneyTodayIso", async () => {
    const { deps, sent } = screen();
    await logLowRisk(deps, 7);
    // The Sydney date, not the timestamp. They differ by design: a Sydney
    // morning is the previous day in UTC.
    expect(sent[0]?.date_contacted).toBe(TODAY);
    expect(sent[0]?.date_contacted).not.toBe(NOW);
    expect(sent[0]?.date_contacted).not.toContain("T");
  });

  test("the student id is carried through untouched", async () => {
    const { deps, sent } = screen();
    await logLowRisk(deps, "abc-123");
    expect(sent[0]?.student_id).toBe("abc-123");
  });

  test("the pair is the one p2.ts reads as done", () => {
    expect(CONTACT_METHODS).toContain(LOW_RISK_METHOD);
    expect(OUTCOMES_BY_METHOD[LOW_RISK_METHOD]).toEqual(["Noted"]);
    expect(OUTCOMES_BY_METHOD[LOW_RISK_METHOD]).toContain(LOW_RISK_OUTCOME);
    expect(deriveStatus({ method: LOW_RISK_METHOD, outcome: LOW_RISK_OUTCOME })).toBe("low_risk");
  });

  test("the method without the outcome would record attempted, which is why both are written", () => {
    expect(deriveStatus({ method: LOW_RISK_METHOD, outcome: "" })).toBe("attempted");
    expect(deriveStatus({ method: LOW_RISK_METHOD, outcome: null })).toBe("attempted");
  });

  test("the select asks for the columns the roster holds", () => {
    expect(LOW_RISK_SELECT).toBe("id, student_id, method, outcome, logged_at, date_contacted");
  });

  test("what comes back goes to the roster's own handler, not a second path", async () => {
    const { deps, state } = screen();
    await logLowRisk(deps, 7);
    expect(state.saved).toEqual([SAVED]);
  });
});

describe("the busy guard", () => {
  test("a second tap while busy does not write a second row", async () => {
    // The save never settles, so the first tap is still in flight.
    let release: ((value: { data: SavedLowRiskLog | null; error: unknown }) => void) | null = null;
    const pending = new Promise<{ data: SavedLowRiskLog | null; error: unknown }>((resolve) => {
      release = resolve;
    });
    const sent: LowRiskEntry[] = [];
    let busyId: string | null = null;
    const deps: LowRiskDeps = {
      busyId: () => busyId,
      setBusyId: (id) => {
        busyId = id;
      },
      save: (entry) => {
        sent.push(entry);
        return pending;
      },
      onSaved: () => {},
      setError: () => {},
      today: () => TODAY,
      now: () => NOW,
    };
    const first = logLowRisk(deps, 7);
    await logLowRisk(deps, 7);
    // A different student is refused too: one write at a time, the way the
    // entry delete already works.
    await logLowRisk(deps, 8);
    expect(sent).toHaveLength(1);
    release?.({ data: SAVED, error: null });
    await first;
    expect(sent).toHaveLength(1);
  });

  test("the guard is released, so the next tap works", async () => {
    const { deps, sent } = screen();
    await logLowRisk(deps, 7);
    await logLowRisk(deps, 7);
    expect(sent).toHaveLength(2);
  });

  test("the busy flag carries the student, and is cleared on success", async () => {
    const seen: (string | null)[] = [];
    const { deps, state } = screen();
    const wrapped: LowRiskDeps = {
      ...deps,
      setBusyId: (id) => {
        seen.push(id);
        state.busyId = id;
      },
    };
    await logLowRisk(wrapped, 7);
    expect(seen).toEqual(["7", null]);
    expect(state.busyId).toBeNull();
  });

  test("a failure still clears the flag, so the button is not left dead", async () => {
    const { deps, state } = screen({ data: null, error: { message: "no" } });
    await logLowRisk(deps, 7);
    expect(state.busyId).toBeNull();
  });

  test("a thrown request still clears the flag", async () => {
    const { deps, state } = screen(() => {
      throw new Error("network");
    });
    await logLowRisk(deps, 7);
    expect(state.busyId).toBeNull();
  });
});

describe("errors", () => {
  test("a failed insert writes to the new per row error state and leaves rowMessage untouched", async () => {
    const { deps, state } = screen({ data: null, error: { message: "denied" } });
    const before = state.rowMessage;
    await logLowRisk(deps, 7);
    expect(state.lowRiskError).toEqual({ studentId: "7", text: LOW_RISK_FAILED });
    expect(state.rowMessage).toBe(before);
    expect(state.saved).toHaveLength(0);
  });

  test("a request that throws reads the same as one that returns an error", async () => {
    const { deps, state } = screen(() => {
      throw new Error("network");
    });
    await logLowRisk(deps, 7);
    expect(state.lowRiskError).toEqual({ studentId: "7", text: LOW_RISK_FAILED });
    expect(state.rowMessage).toBe("Something another row is showing");
  });

  test("an insert that reports no error but returns nothing is still a failure", async () => {
    const { deps, state } = screen({ data: null, error: null });
    await logLowRisk(deps, 7);
    expect(state.lowRiskError?.text).toBe(LOW_RISK_FAILED);
    expect(state.saved).toHaveLength(0);
  });

  test("a fresh tap clears the last failure before trying again", async () => {
    const { deps, state } = screen();
    state.lowRiskError = { studentId: "7", text: LOW_RISK_FAILED };
    await logLowRisk(deps, 7);
    expect(state.lowRiskError).toBeNull();
  });

  test("the message belongs to one row and shows under no other", () => {
    const error: RowError = { studentId: "7", text: LOW_RISK_FAILED };
    expect(rowErrorFor(error, 7)).toBe(LOW_RISK_FAILED);
    expect(rowErrorFor(error, "7")).toBe(LOW_RISK_FAILED);
    expect(rowErrorFor(error, 8)).toBeNull();
    expect(rowErrorFor(null, 7)).toBeNull();
  });
});

describe("when one tap is refused", () => {
  const ALL: ContactStatus[] = [
    "none",
    "p2_complete",
    "email_report",
    "low_risk",
    "attempted",
    "sms",
    "light",
    "touch_email",
  ];

  test("only a completed P2 blocks it", () => {
    for (const status of ALL) {
      expect(lowRiskBlocked(status)).toBe(status === "p2_complete");
    }
  });

  test("a student already logged as low risk can be logged again", () => {
    expect(lowRiskBlocked("low_risk")).toBe(false);
  });

  test("the arrow is never blocked", () => {
    expect(arrowBlocked()).toBe(false);
  });

  test("the explanation says why, in plain words", () => {
    expect(LOW_RISK_BLOCKED_TITLE).toContain("P2 Complete");
    expect(LOW_RISK_BLOCKED_TITLE).toContain("arrow");
  });
});

describe("the entry builder", () => {
  test("builds the whole row and nothing else", () => {
    expect(lowRiskEntry(7, TODAY, NOW)).toEqual({
      student_id: 7,
      date_contacted: TODAY,
      method: "Low Risk Parent",
      outcome: "Noted",
      logged_at: NOW,
    });
  });

  test("logged_at is never left out, which would sort the row above every real entry", () => {
    const entry = lowRiskEntry(7, TODAY, NOW);
    expect(entry.logged_at).toBe(NOW);
    expect(Object.keys(entry)).toContain("logged_at");
  });
});
