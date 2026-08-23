import { describe, expect, it } from "bun:test";
import {
  DEFAULT_NAV_LABELS,
  GROUP_KEYS,
  MAX_LABEL_LENGTH,
  SCREEN_KEYS,
  checkNavLabels,
  readNavLabels,
  sameNavLabels,
  tidyNavLabels,
  type NavLabels,
} from "./navLabels";

const RENAMED: NavLabels = {
  groups: { daily: "Each day", followUp: "Chasing", setup: "Admin" },
  screens: {
    today: "Notes",
    output: "Tonight",
    parents: "Families",
    manager: "Jobs",
    settings: "Options",
    templates: "Wording",
  },
};

describe("falling back to the built in names", () => {
  it("uses them all when nav_labels is missing", () => {
    for (const missing of [null, undefined, "", 0, false, "not an object"]) {
      expect(readNavLabels(missing)).toEqual(DEFAULT_NAV_LABELS);
    }
  });

  it("uses them all when nav_labels is empty", () => {
    expect(readNavLabels({})).toEqual(DEFAULT_NAV_LABELS);
    expect(readNavLabels({ groups: {}, screens: {} })).toEqual(DEFAULT_NAV_LABELS);
  });

  it("falls back for one missing value only, keeping the rest", () => {
    const read = readNavLabels({
      groups: { daily: "Each day" },
      screens: { today: "Notes", parents: "Families" },
    });
    expect(read.groups.daily).toBe("Each day");
    expect(read.screens.today).toBe("Notes");
    expect(read.screens.parents).toBe("Families");
    // Everything not named keeps the name built into the app.
    expect(read.groups.followUp).toBe("Follow up");
    expect(read.groups.setup).toBe("Setup");
    expect(read.screens.output).toBe("Output");
    expect(read.screens.manager).toBe("Manager");
    expect(read.screens.settings).toBe("Settings");
    expect(read.screens.templates).toBe("Templates");
  });

  it("falls back for a blank value, so no label is ever empty", () => {
    const read = readNavLabels({
      groups: { daily: "", followUp: "   ", setup: "Admin" },
      screens: { today: "", output: "\t", parents: "Families" },
    });
    expect(read.groups.daily).toBe("Daily");
    expect(read.groups.followUp).toBe("Follow up");
    expect(read.groups.setup).toBe("Admin");
    expect(read.screens.today).toBe("Today");
    expect(read.screens.output).toBe("Output");
    expect(read.screens.parents).toBe("Families");
  });

  it("falls back for a value of the wrong type", () => {
    const read = readNavLabels({ groups: { daily: 42 }, screens: { today: ["Notes"] } });
    expect(read.groups.daily).toBe("Daily");
    expect(read.screens.today).toBe("Today");
  });

  it("never returns an empty label, whatever it is handed", () => {
    for (const stored of [null, {}, { groups: { daily: " " } }, { screens: { manager: "" } }]) {
      const read = readNavLabels(stored);
      for (const key of GROUP_KEYS) expect(read.groups[key].trim()).not.toBe("");
      for (const key of SCREEN_KEYS) expect(read.screens[key].trim()).not.toBe("");
    }
  });

  it("trims what it reads", () => {
    expect(readNavLabels({ screens: { today: "  Notes  " } }).screens.today).toBe("Notes");
  });
});

describe("refusing a name that will not fit", () => {
  it("accepts the built in names and a sensible rename", () => {
    expect(checkNavLabels(DEFAULT_NAV_LABELS)).toBeNull();
    expect(checkNavLabels(RENAMED)).toBeNull();
  });

  it("refuses a name longer than twenty characters, naming the field", () => {
    expect(MAX_LABEL_LENGTH).toBe(20);
    const tooLong = { ...RENAMED, screens: { ...RENAMED.screens, parents: "A".repeat(21) } };
    const problem = checkNavLabels(tooLong);
    expect(problem).not.toBeNull();
    expect(problem?.field).toBe("Parent tracker");
    expect(problem?.message).toContain("longer than 20 characters");
  });

  it("accepts exactly twenty characters", () => {
    const atLimit = { ...RENAMED, screens: { ...RENAMED.screens, parents: "A".repeat(20) } };
    expect(checkNavLabels(atLimit)).toBeNull();
  });

  it("refuses an empty field, naming it", () => {
    const blank = { ...RENAMED, groups: { ...RENAMED.groups, followUp: "   " } };
    const problem = checkNavLabels(blank);
    expect(problem?.field).toBe("Follow up");
    expect(problem?.message).toContain("cannot be empty");
  });

  it("names a group field by its built in name, not by what it was renamed to", () => {
    const blank = { ...RENAMED, groups: { ...RENAMED.groups, daily: "" } };
    expect(checkNavLabels(blank)?.field).toBe("Daily");
  });

  it("names a screen field by what the screen is for, not by its name", () => {
    for (const [key, field] of [
      ["today", "Note writing"],
      ["output", "Tonight's output"],
      ["manager", "Manager touch points"],
      ["settings", "This screen"],
    ] as const) {
      const blank = { ...RENAMED, screens: { ...RENAMED.screens, [key]: "" } };
      expect(checkNavLabels(blank)?.field).toBe(field);
    }
  });
});

describe("resetting", () => {
  it("restores the built in names", () => {
    expect(sameNavLabels(RENAMED, DEFAULT_NAV_LABELS)).toBe(false);
    expect(sameNavLabels(DEFAULT_NAV_LABELS, DEFAULT_NAV_LABELS)).toBe(true);
    // Reset is storing the built in set, which reads back unchanged.
    expect(readNavLabels(DEFAULT_NAV_LABELS)).toEqual(DEFAULT_NAV_LABELS);
  });

  it("sees a single difference", () => {
    const one = {
      ...DEFAULT_NAV_LABELS,
      screens: { ...DEFAULT_NAV_LABELS.screens, today: "Notes" },
    };
    expect(sameNavLabels(one, DEFAULT_NAV_LABELS)).toBe(false);
  });

  it("tidies the edges off before storing", () => {
    const messy = {
      groups: { daily: " Each day ", followUp: "Chasing ", setup: " Admin" },
      screens: { ...RENAMED.screens, today: "  Notes  " },
    };
    expect(tidyNavLabels(messy)).toEqual(RENAMED);
  });
});

describe("the internal keys are never touched by a rename", () => {
  it("keeps the same group and screen keys whatever the names become", () => {
    const read = readNavLabels(RENAMED);
    expect(Object.keys(read.groups).sort()).toEqual(["daily", "followUp", "setup"]);
    expect(Object.keys(read.screens).sort()).toEqual([
      "manager",
      "output",
      "parents",
      "settings",
      "templates",
      "today",
    ]);
  });

  it("keeps the key list stable even when every name is blanked", () => {
    const read = readNavLabels({
      groups: { daily: "", followUp: "", setup: "" },
      screens: { today: "", output: "", parents: "", manager: "", settings: "", templates: "" },
    });
    expect(GROUP_KEYS.every((key) => key in read.groups)).toBe(true);
    expect(SCREEN_KEYS.every((key) => key in read.screens)).toBe(true);
    expect(read).toEqual(DEFAULT_NAV_LABELS);
  });

  it("ignores any extra key it is handed rather than carrying it through", () => {
    const read = readNavLabels({
      groups: { daily: "Each day", nonsense: "Nope" },
      screens: { today: "Notes", alsoNonsense: "Nope" },
    });
    expect("nonsense" in read.groups).toBe(false);
    expect("alsoNonsense" in read.screens).toBe(false);
  });
});
