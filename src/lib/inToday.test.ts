import { describe, expect, it } from "bun:test";
import {
  attendsOn,
  buildInTodayChips,
  countInToday,
  scheduleTimeForDay,
  TOUCH_POINT_STALE_DAYS,
  type BuildInTodayParams,
  type InTodayRoster,
} from "./inToday";

// Today is Friday 21 August 2026. The 20 day window reaches back to 1 August,
// so a touch on or after the 1st is covered and anything before it is stale.
const TODAY = "2026-08-21";

describe("who is in today", () => {
  it("matches a weekday case-insensitively", () => {
    expect(attendsOn(["Monday", "Friday"], "Friday")).toBe(true);
    expect(attendsOn(["friday"], "Friday")).toBe(true);
    expect(attendsOn(["Monday", "Thursday"], "Friday")).toBe(false);
  });

  it("reads no days as not in, rather than in every day", () => {
    expect(attendsOn(null, "Friday")).toBe(false);
    expect(attendsOn([], "Friday")).toBe(false);
    expect(attendsOn(undefined, "Friday")).toBe(false);
    expect(attendsOn(["Friday"], "")).toBe(false);
  });

  it("counts the active students in today", () => {
    const roster: InTodayRoster[] = [
      { id: 1, student_name: "A", attendance_days: ["Friday"] },
      { id: 2, student_name: "B", attendance_days: ["Monday"] },
      { id: 3, student_name: "C", attendance_days: ["Thursday", "Friday"] },
    ];
    expect(countInToday(roster, "Friday")).toBe(2);
  });
});

describe("today's time from the schedule", () => {
  it("reads the time for today's day", () => {
    expect(scheduleTimeForDay("Monday 16:30, Friday 17:30", "Friday")).toBe("5:30 pm");
    expect(scheduleTimeForDay("Monday 16:30, Friday 17:30", "Monday")).toBe("4:30 pm");
  });

  it("takes the earliest when the day appears more than once", () => {
    expect(scheduleTimeForDay("Friday 17:30, Friday 16:00", "Friday")).toBe("4:00 pm");
  });

  it("formats morning, noon and midnight sensibly", () => {
    expect(scheduleTimeForDay("Friday 9:30", "Friday")).toBe("9:30 am");
    expect(scheduleTimeForDay("Friday 12:00", "Friday")).toBe("12:00 pm");
    expect(scheduleTimeForDay("Friday 00:15", "Friday")).toBe("12:15 am");
  });

  it("gives null when the day is absent or nothing parses", () => {
    expect(scheduleTimeForDay("Monday 16:30", "Friday")).toBeNull();
    expect(scheduleTimeForDay("Friday evening", "Friday")).toBeNull();
    expect(scheduleTimeForDay("", "Friday")).toBeNull();
    expect(scheduleTimeForDay(null, "Friday")).toBeNull();
    expect(scheduleTimeForDay("Friday 25:00", "Friday")).toBeNull();
  });
});

describe("who needs a touch point today", () => {
  const roster: InTodayRoster[] = [
    { id: "ava", student_name: "Ava Donnelly", attendance_days: ["Friday"] },
    { id: "bo", student_name: "Bo Ng", attendance_days: ["friday"] },
    { id: "cara", student_name: "Cara Lee", attendance_days: ["Friday"] },
    { id: "dan", student_name: "Dan Fox", attendance_days: ["Friday"] },
    { id: "eve", student_name: "Eve Day", attendance_days: ["Monday"] },
    { id: "finn", student_name: "Finn Oak", attendance_days: ["Friday"] },
    { id: "gus", student_name: "Gus Ray", attendance_days: ["Friday"] },
  ];

  function build(over: Partial<BuildInTodayParams> = {}) {
    return buildInTodayChips({
      students: roster,
      weekday: "Friday",
      todayIso: TODAY,
      noteLatestById: new Map<string, string | null>([
        ["bo", "2026-07-01"], // stale note
        ["cara", "2026-08-15"], // recent note, covered
        ["finn", "2026-06-01"], // stale note, but a newer quick below
        ["gus", "2026-08-01"], // exactly on the cutoff, covered
      ]),
      quickLatestById: new Map<string, string | null>([
        ["dan", "2026-07-10"], // stale quick
        ["finn", "2026-07-20"], // newer than Finn's note
      ]),
      ...over,
    });
  }

  it("lists only in-today students who still need a touch point", () => {
    const names = build().map((c) => c.studentName);
    // Ava never contacted; Bo/Dan/Finn stale. Cara and Gus covered, Eve not in.
    expect(names).toEqual(["Ava Donnelly", "Bo Ng", "Dan Fox", "Finn Oak"]);
  });

  it("orders never-contacted first, then oldest, then by name", () => {
    const chips = build();
    expect(chips.map((c) => c.lastTouchDate)).toEqual([
      null, // Ava
      "2026-07-01", // Bo
      "2026-07-10", // Dan
      "2026-07-20", // Finn (the newer of his note and quick)
    ]);
  });

  it("breaks ties on the date alphabetically by name", () => {
    const chips = buildInTodayChips({
      students: [
        { id: 1, student_name: "Zoe West", attendance_days: ["Friday"] },
        { id: 2, student_name: "Amy East", attendance_days: ["Friday"] },
      ],
      weekday: "Friday",
      todayIso: TODAY,
      noteLatestById: new Map([
        ["1", "2026-07-05"],
        ["2", "2026-07-05"],
      ]),
      quickLatestById: new Map(),
    });
    expect(chips.map((c) => c.studentName)).toEqual(["Amy East", "Zoe West"]);
  });

  it("counts a quick email as a touch point, like the Dashboard", () => {
    const chips = buildInTodayChips({
      students: [{ id: "x", student_name: "Max Hill", attendance_days: ["Friday"] }],
      weekday: "Friday",
      todayIso: TODAY,
      noteLatestById: new Map(),
      quickLatestById: new Map([["x", "2026-08-10"]]), // within 20 days
    });
    expect(chips).toEqual([]);
  });

  it("excludes anyone contacted within the stale window, includes on the edge", () => {
    const base = {
      students: [{ id: "x", student_name: "Max Hill", attendance_days: ["Friday"] }],
      weekday: "Friday",
      todayIso: TODAY,
      quickLatestById: new Map<string, string | null>(),
    };
    // 1 August is the cutoff: covered. 31 July is older: needs.
    expect(
      buildInTodayChips({ ...base, noteLatestById: new Map([["x", "2026-08-01"]]) }),
    ).toHaveLength(0);
    expect(
      buildInTodayChips({ ...base, noteLatestById: new Map([["x", "2026-07-31"]]) }),
    ).toHaveLength(1);
  });

  it("carries the short label and today's time on each chip", () => {
    const chips = buildInTodayChips({
      students: [
        {
          id: "x",
          student_name: "Ava Donnelly",
          attendance_days: ["Friday"],
          attendance_schedule: "Monday 16:30, Friday 17:30",
        },
      ],
      weekday: "Friday",
      todayIso: TODAY,
      noteLatestById: new Map(),
      quickLatestById: new Map(),
    });
    expect(chips[0]).toMatchObject({
      studentName: "Ava Donnelly",
      label: "Ava D",
      time: "5:30 pm",
      lastTouchDate: null,
    });
  });

  it("shows no time when the schedule has nothing for today", () => {
    const chips = buildInTodayChips({
      students: [
        {
          id: "x",
          student_name: "Ava Donnelly",
          attendance_days: ["Friday"],
          attendance_schedule: "Monday 16:30",
        },
      ],
      weekday: "Friday",
      todayIso: TODAY,
      noteLatestById: new Map(),
      quickLatestById: new Map(),
    });
    expect(chips[0]?.time).toBeNull();
  });

  it("uses a 20 day window", () => {
    expect(TOUCH_POINT_STALE_DAYS).toBe(20);
  });
});
