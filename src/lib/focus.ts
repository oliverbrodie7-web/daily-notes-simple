// Small shared helpers: the Monday a week starts on, the parent name match the
// Parents screen uses, and the short student name shown on a chip. The parent
// name matching lives here so every screen reads the same rule.

// Trim and lowercase, the rule the Parents screen has always used to match a
// focus row to a student.
export function normaliseParentName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// The Monday of the week containing this date. Dates are compared as ISO
// strings and stepped in whole UTC days, so no timezone can drift the
// answer.
export function mondayOf(dateIso: string): string {
  const time = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(time)) return "";
  // getUTCDay is 0 for Sunday, so Monday is 0 days back and Sunday is 6.
  const back = (new Date(time).getUTCDay() + 6) % 7;
  return new Date(time - back * 86_400_000).toISOString().slice(0, 10);
}

// First name and a single initial, no full stop. A student with no surname
// recorded keeps their first name alone.
export function shortStudentName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const first = parts[0];
  if (!first) return "";
  if (parts.length === 1) return first;
  const initial = parts[parts.length - 1]?.[0] ?? "";
  return initial ? `${first} ${initial.toUpperCase()}` : first;
}
