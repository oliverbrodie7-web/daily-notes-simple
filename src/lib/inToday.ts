// The "In today, needs a touch point" box on the Today screen.
//
// Nothing here reads the network. It takes the active roster, the weekday it is
// in Sydney, and the two touch point tracks already loaded for the term, and
// returns the students who come in today and still need a touch point, ordered
// never-contacted first then longest-ago first. The touch point rule is reused,
// not reinvented: a daily note counts through matchTouchPoints, a quick email
// counts the same way the Dashboard counts it, and a contact inside the stale
// window is covered so the two screens agree about who is reached.

import { shortStudentName } from "./focus";

// How many days without a touch point before a student who is in today is
// nudged again. A contact inside this window counts as covered.
export const TOUCH_POINT_STALE_DAYS = 20;

export type InTodayRoster = {
  id: number | string;
  student_name: string;
  // The day names the student comes in, like ["Monday", "Thursday"]. Missing
  // or empty means the roster does not say, which reads as not in today rather
  // than in every day.
  attendance_days?: string[] | null;
  // A free text schedule like "Monday 16:30, Thursday 17:30", used only to show
  // today's time on the chip.
  attendance_schedule?: string | null;
};

// One chip: a student who is in today and still needs a touch point. The label
// and time are ready to render; lastTouchDate is kept so the order can be
// explained and checked.
export type InTodayChip = {
  id: string;
  // The full name, for filling the Student Name field when the chip is tapped.
  studentName: string;
  // The short "James S" form shown on the chip face.
  label: string;
  // Today's lesson time like "4:30 pm", or null when none can be read.
  time: string | null;
  lastTouchDate: string | null;
};

export type BuildInTodayParams = {
  students: InTodayRoster[];
  // Today's Sydney weekday long name, like "Monday".
  weekday: string;
  // Today's Sydney date, YYYY-MM-DD, the anchor for the stale window.
  todayIso: string;
  // Latest daily-note touch date per student id. A key being present means the
  // student has a note touch point this term, which is matchTouchPoints' own
  // rule; the value is that summary's latestDate.
  noteLatestById: Map<string, string | null>;
  // Latest quick-email date per student id. A key being present means the
  // student has a quick email this term, counted the way the Dashboard counts
  // it; the value is the most recent quick email's date.
  quickLatestById: Map<string, string | null>;
  staleDays?: number;
};

// Trim and lowercase, so case and spacing can never decide a day comparison.
function tidyDay(day: string | null | undefined): string {
  return (day ?? "").trim().toLowerCase();
}

// Whether the student's attendance days include the given weekday, compared
// case-insensitively. No days recorded reads as not in today.
export function attendsOn(days: string[] | null | undefined, weekday: string): boolean {
  const wanted = tidyDay(weekday);
  if (!wanted || !Array.isArray(days)) return false;
  return days.some((day) => tidyDay(day) === wanted);
}

// How many active students come in on the given weekday, for the header count.
export function countInToday(students: InTodayRoster[], weekday: string): number {
  return students.filter((student) => attendsOn(student.attendance_days, weekday)).length;
}

// A 24 hour "16:30" as a 12 hour "4:30 pm", the way the rest of the app shows a
// time. Null for anything that is not a plain hour and minute.
function to12Hour(hhmm: string): string | null {
  const found = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!found) return null;
  const hour = Number(found[1]);
  const minute = found[2]!;
  if (hour > 23 || Number(minute) > 59) return null;
  const marker = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${marker}`;
}

// The earliest lesson time recorded for the given weekday in a schedule like
// "Monday 16:30, Thursday 17:30". Null when the day is absent or no time on it
// can be read, so the chip shows no time rather than a wrong one. When the day
// appears more than once the earliest is taken.
export function scheduleTimeForDay(
  schedule: string | null | undefined,
  weekday: string,
): string | null {
  const wanted = tidyDay(weekday);
  if (!wanted || !schedule) return null;
  let best: { minutes: number; label: string } | null = null;
  for (const partRaw of schedule.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    // "Monday 16:30": the first token is the day, the last the time.
    const tokens = part.split(/\s+/);
    if (tokens.length < 2) continue;
    if (tidyDay(tokens[0]) !== wanted) continue;
    const raw = tokens[tokens.length - 1] ?? "";
    const found = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!found) continue;
    const minutes = Number(found[1]) * 60 + Number(found[2]);
    const label = to12Hour(raw);
    if (!label) continue;
    if (!best || minutes < best.minutes) best = { minutes, label };
  }
  return best?.label ?? null;
}

// The later of two dates, treating null as absent. Null only when both are.
function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// The date `days` days before an ISO date, stepped in whole UTC days so no
// timezone can drift the answer, the same way the week helper does it.
function isoMinusDays(iso: string, days: number): string {
  const time = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(time)) return iso;
  return new Date(time - days * 86_400_000).toISOString().slice(0, 10);
}

// Never-contacted first, then by last touch date oldest first, ties broken by
// name so the box does not reshuffle between loads.
function compareChips(a: InTodayChip, b: InTodayChip): number {
  if (a.lastTouchDate === null && b.lastTouchDate !== null) return -1;
  if (a.lastTouchDate !== null && b.lastTouchDate === null) return 1;
  if (a.lastTouchDate !== null && b.lastTouchDate !== null && a.lastTouchDate !== b.lastTouchDate) {
    return a.lastTouchDate < b.lastTouchDate ? -1 : 1;
  }
  return a.studentName.localeCompare(b.studentName);
}

export function buildInTodayChips(params: BuildInTodayParams): InTodayChip[] {
  const { students, weekday, todayIso, noteLatestById, quickLatestById } = params;
  const staleDays = params.staleDays ?? TOUCH_POINT_STALE_DAYS;
  const cutoff = isoMinusDays(todayIso, staleDays);

  const chips: InTodayChip[] = [];
  for (const student of students) {
    if (!attendsOn(student.attendance_days, weekday)) continue;
    const id = String(student.id);
    const hasTouchPoint = noteLatestById.has(id) || quickLatestById.has(id);
    const lastTouchDate = laterDate(
      noteLatestById.get(id) ?? null,
      quickLatestById.get(id) ?? null,
    );
    // Needs one when never contacted, or when the most recent contact is older
    // than the stale window. A contact on or inside the cutoff is covered and
    // drops out, which is the Dashboard's view of who is reached.
    const needs = !hasTouchPoint || lastTouchDate === null || lastTouchDate < cutoff;
    if (!needs) continue;
    chips.push({
      id,
      studentName: student.student_name,
      label: shortStudentName(student.student_name),
      time: scheduleTimeForDay(student.attendance_schedule, weekday),
      lastTouchDate,
    });
  }

  chips.sort(compareChips);
  return chips;
}
