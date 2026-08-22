// The names shown for each screen and each sidebar group.
//
// These are display text only. The internal keys never change: renaming a
// screen changes what a person reads and nothing else, so nothing that
// navigates, stores or matches is touched by it.

export type NavGroupKey = "daily" | "followUp" | "setup";
export type NavScreenKey = "today" | "output" | "parents" | "manager" | "settings";

export type NavLabels = {
  groups: Record<NavGroupKey, string>;
  screens: Record<NavScreenKey, string>;
};

// The names built into the app, used whenever a stored one is missing or
// blank. The app must never show an empty label.
export const DEFAULT_NAV_LABELS: NavLabels = {
  groups: {
    daily: "Daily",
    followUp: "Follow up",
    setup: "Setup",
  },
  screens: {
    today: "Today",
    output: "Output",
    parents: "Parents",
    manager: "Manager",
    settings: "Settings",
  },
};

export const GROUP_KEYS: NavGroupKey[] = ["daily", "followUp", "setup"];
export const SCREEN_KEYS: NavScreenKey[] = ["today", "output", "parents", "manager", "settings"];

// What each screen is for, rather than what it is called. Used to label the
// fields on Settings, so a label does not change as the person types.
export const SCREEN_FIELD_LABELS: Record<NavScreenKey, string> = {
  today: "Note writing",
  output: "Tonight's output",
  parents: "Parent tracker",
  manager: "Manager touch points",
  settings: "This screen",
};

// A name long enough to break the sidebar or the phone bar.
export const MAX_LABEL_LENGTH = 20;

function usable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Falls back per value, not per object, so one blank name never takes the
// rest of them with it.
export function readNavLabels(stored: unknown): NavLabels {
  const source = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const groups = source["groups"] as Record<string, unknown> | undefined;
  const screens = source["screens"] as Record<string, unknown> | undefined;

  const pick = <K extends string>(
    from: Record<string, unknown> | undefined,
    key: K,
    fallback: string,
  ): string => {
    const value = from?.[key];
    return usable(value) ? value.trim() : fallback;
  };

  return {
    groups: {
      daily: pick(groups, "daily", DEFAULT_NAV_LABELS.groups.daily),
      followUp: pick(groups, "followUp", DEFAULT_NAV_LABELS.groups.followUp),
      setup: pick(groups, "setup", DEFAULT_NAV_LABELS.groups.setup),
    },
    screens: {
      today: pick(screens, "today", DEFAULT_NAV_LABELS.screens.today),
      output: pick(screens, "output", DEFAULT_NAV_LABELS.screens.output),
      parents: pick(screens, "parents", DEFAULT_NAV_LABELS.screens.parents),
      manager: pick(screens, "manager", DEFAULT_NAV_LABELS.screens.manager),
      settings: pick(screens, "settings", DEFAULT_NAV_LABELS.screens.settings),
    },
  };
}

export type LabelProblem = { field: string; message: string } | null;

// Says which field is wrong and why, in plain words.
export function checkNavLabels(labels: NavLabels): LabelProblem {
  const named: [string, string][] = [
    ...GROUP_KEYS.map(
      (key) => [DEFAULT_NAV_LABELS.groups[key], labels.groups[key]] as [string, string],
    ),
    ...SCREEN_KEYS.map(
      (key) => [SCREEN_FIELD_LABELS[key], labels.screens[key]] as [string, string],
    ),
  ];
  for (const [field, value] of named) {
    if (value.trim().length === 0) return { field, message: `${field} cannot be empty.` };
    if (value.trim().length > MAX_LABEL_LENGTH) {
      return {
        field,
        message: `${field} is longer than ${MAX_LABEL_LENGTH} characters, which would not fit the sidebar.`,
      };
    }
  }
  return null;
}

// Trimmed, ready to store.
export function tidyNavLabels(labels: NavLabels): NavLabels {
  return {
    groups: {
      daily: labels.groups.daily.trim(),
      followUp: labels.groups.followUp.trim(),
      setup: labels.groups.setup.trim(),
    },
    screens: {
      today: labels.screens.today.trim(),
      output: labels.screens.output.trim(),
      parents: labels.screens.parents.trim(),
      manager: labels.screens.manager.trim(),
      settings: labels.screens.settings.trim(),
    },
  };
}

export function sameNavLabels(a: NavLabels, b: NavLabels): boolean {
  return (
    GROUP_KEYS.every((key) => a.groups[key] === b.groups[key]) &&
    SCREEN_KEYS.every((key) => a.screens[key] === b.screens[key])
  );
}
