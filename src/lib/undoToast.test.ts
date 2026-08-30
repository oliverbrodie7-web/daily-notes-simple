import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import {
  UNDO_FAILED,
  UNDO_SUFFIX,
  UNDO_TOAST_MS,
  planDismiss,
  runUndo,
  toastFromLog,
  type UndoDeps,
  type UndoToast,
} from "./undoToast";

const SAVED = {
  id: 91,
  student_id: 7,
  method: "Low Risk Parent",
  outcome: "Noted",
  logged_at: "2026-08-30T04:15:22.000Z",
  date_contacted: "2026-08-30",
};

type Log = { id: number | string; student_id: number | string };

// A stand in for the screen: the strip, the logs array the roster holds,
// and the state the strip must not touch.
function screen(result: { error: unknown } | (() => never) = { error: null }) {
  const state = {
    undoToast: null as UndoToast,
    undoBusy: false,
    undoFailure: null as string | null,
    logs: [
      { id: 91, student_id: 7 },
      { id: 90, student_id: 7 },
    ] as Log[],
    rowMessage: "Something another row is showing" as string | null,
  };
  const remove = mock(async (_logId: string) => {
    if (typeof result === "function") return result();
    return result;
  });
  const deps: UndoDeps = {
    remove,
    dropLog: (logId) => {
      state.logs = state.logs.filter((log) => String(log.id) !== logId);
    },
    clear: () => {
      state.undoToast = null;
    },
    setBusy: (busy) => {
      state.undoBusy = busy;
    },
    setFailure: (text) => {
      state.undoFailure = text;
    },
  };
  return { deps, state, remove };
}

describe("raising the strip", () => {
  test("a successful low risk tap sets the undo state from the returned row id", () => {
    const toast = toastFromLog(SAVED, "Alice Dominguez", 1756_000_000_000);
    expect(toast.logId).toBe("91");
    expect(toast.studentName).toBe("Alice Dominguez");
    expect(toast.at).toBe(1756_000_000_000);
  });

  test("the id is the row's own, whatever type it came back as", () => {
    expect(toastFromLog({ id: "uuid-a" }, "Bo Ng", 1).logId).toBe("uuid-a");
    expect(toastFromLog({ id: 0 }, "Bo Ng", 1).logId).toBe("0");
  });

  test("the strip says what happened, not what to do", () => {
    expect(UNDO_SUFFIX).toBe(" marked low risk");
  });
});

describe("undo", () => {
  test("undo deletes the contact_log row matching the stored id", async () => {
    const { deps, remove } = screen();
    const toast = toastFromLog(SAVED, "Alice Dominguez", 1);
    await runUndo(deps, toast.logId);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]).toEqual(["91"]);
  });

  test("undo removes that entry from logs and clears the strip", async () => {
    const { deps, state } = screen();
    state.undoToast = toastFromLog(SAVED, "Alice Dominguez", 1);
    await runUndo(deps, "91");
    expect(state.logs.map((log) => log.id)).toEqual([90]);
    expect(state.undoToast).toBeNull();
    expect(state.undoFailure).toBeNull();
  });

  test("a failed undo keeps the strip open and leaves the button usable", async () => {
    const { deps, state } = screen({ error: { message: "denied" } });
    state.undoToast = toastFromLog(SAVED, "Alice Dominguez", 1);
    await runUndo(deps, "91");
    expect(state.undoToast).not.toBeNull();
    expect(state.undoFailure).toBe(UNDO_FAILED);
    // Not left busy, so it can be pressed again.
    expect(state.undoBusy).toBe(false);
    // And the row is still logged, because nothing was deleted.
    expect(state.logs.map((log) => log.id)).toEqual([91, 90]);
  });

  test("a second attempt after a failure can succeed", async () => {
    let fail = true;
    const state = { logs: [{ id: 91 }] as { id: number }[], toast: "open" as string | null };
    const deps: UndoDeps = {
      remove: async () => (fail ? { error: { message: "no" } } : { error: null }),
      dropLog: (logId) => {
        state.logs = state.logs.filter((log) => String(log.id) !== logId);
      },
      clear: () => {
        state.toast = null;
      },
      setBusy: () => {},
      setFailure: () => {},
    };
    await runUndo(deps, "91");
    expect(state.toast).toBe("open");
    fail = false;
    await runUndo(deps, "91");
    expect(state.toast).toBeNull();
    expect(state.logs).toEqual([]);
  });

  test("a request that throws reads the same as one that returns an error", async () => {
    const { deps, state } = screen(() => {
      throw new Error("network");
    });
    state.undoToast = toastFromLog(SAVED, "Alice Dominguez", 1);
    await runUndo(deps, "91");
    expect(state.undoToast).not.toBeNull();
    expect(state.undoFailure).toBe(UNDO_FAILED);
    expect(state.undoBusy).toBe(false);
  });

  test("the button is busy while it runs and free afterwards", async () => {
    const seen: boolean[] = [];
    const { deps } = screen();
    await runUndo({ ...deps, setBusy: (busy) => seen.push(busy) }, "91");
    expect(seen).toEqual([true, false]);
  });

  test("undo never touches the shared row message", async () => {
    const { deps, state } = screen({ error: { message: "denied" } });
    await runUndo(deps, "91");
    expect(state.rowMessage).toBe("Something another row is showing");
  });
});

describe("the countdown", () => {
  const toastA: NonNullable<UndoToast> = { logId: "91", studentName: "Alice", at: 1000 };
  const toastB: NonNullable<UndoToast> = { logId: "92", studentName: "Bo", at: 2000 };

  test("the strip auto dismisses after 8000ms", () => {
    expect(UNDO_TOAST_MS).toBe(8000);
    const plan = planDismiss(toastA, false, null, 0);
    expect(plan.run).toBe(true);
    expect(plan.delay).toBe(8000);
  });

  test("no strip means no timer", () => {
    expect(planDismiss(null, false, "91", 3000).run).toBe(false);
  });

  test("a pointer over it stops the countdown, banking what it has served", () => {
    const plan = planDismiss(toastA, true, "91", 3000);
    expect(plan.run).toBe(false);
    expect(plan.served).toBe(3000);
  });

  test("leaving resumes from where it paused rather than starting again", () => {
    const plan = planDismiss(toastA, false, "91", 3000);
    expect(plan.run).toBe(true);
    expect(plan.delay).toBe(5000);
  });

  test("a strip that has served its time dismisses at once rather than never", () => {
    expect(planDismiss(toastA, false, "91", 9000).delay).toBe(0);
  });

  test("a second low risk tap replaces the strip and cancels the first timer", () => {
    // Driven the way the effect drives it: each change tears the previous
    // timer down before planning the next.
    const fired: string[] = [];
    let handle = 0;
    const timers = new Map<number, { fn: () => void; at: number }>();
    let clock = 0;
    let servedFor: string | null = null;
    let served = 0;
    let running: number | null = null;
    let startedAt = 0;

    function apply(toast: UndoToast, paused: boolean) {
      if (running !== null) {
        timers.delete(running);
        served += clock - startedAt;
        running = null;
      }
      const plan = planDismiss(toast, paused, servedFor, served);
      servedFor = plan.servedFor;
      served = plan.served;
      if (!plan.run) return;
      startedAt = clock;
      running = ++handle;
      timers.set(running, { fn: () => fired.push(toast!.logId), at: clock + plan.delay });
    }
    function tick(ms: number) {
      clock += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= clock) {
          timers.delete(id);
          if (id === running) running = null;
          t.fn();
        }
      }
    }

    apply(toastA, false);
    tick(3000);
    expect(fired).toEqual([]);
    // The second tap lands.
    apply(toastB, false);
    // The first strip's remaining 5000ms passes with nothing firing for it.
    tick(5000);
    expect(fired).toEqual([]);
    // The second gets its own full eight seconds, not the first's leftovers.
    tick(3000);
    expect(fired).toEqual(["92"]);
    expect(timers.size).toBe(0);
  });

  test("a replacement starts from a full eight seconds, not the bank", () => {
    const plan = planDismiss(toastB, false, "91", 7000);
    expect(plan.delay).toBe(8000);
    expect(plan.served).toBe(0);
    expect(plan.servedFor).toBe("92");
  });

  test("a roster reload does not clear the undo state", () => {
    // The screen's own insert fires the contact_log subscription, which
    // reloads everything a moment after the strip appears. This is the
    // regression that would kill it, so it is read out of the source: no
    // part of loadRoster may touch the strip.
    const source = readFileSync(
      new URL("../components/TrackerScreen.tsx", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("const loadRoster = useCallback");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n  }, [", start));
    expect(body.length).toBeGreaterThan(500);
    for (const setter of ["setUndoToast", "setUndoBusy", "setUndoFailure", "setUndoPaused"]) {
      expect(body).not.toContain(setter);
    }
    // What it does set is fetched data and nothing else.
    expect(body).toContain("setLogs(");
    expect(body).toContain("setStudents(");
  });

  test("the strip is not derived from the logs array, so a reload cannot blank it", () => {
    const toast: UndoToast = toastFromLog(SAVED, "Alice Dominguez", 1);
    // A reload replaces the whole array, including with an empty one.
    for (const logs of [[{ id: 91 }], [{ id: 90 }], []]) {
      void logs;
      // Nothing about the strip or its countdown reads it.
      const plan = planDismiss(toast, false, "91", 2000);
      expect(plan.run).toBe(true);
      expect(plan.delay).toBe(6000);
      expect(toast?.studentName).toBe("Alice Dominguez");
    }
  });
});
