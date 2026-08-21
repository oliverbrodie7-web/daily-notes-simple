// Choosing the term the Parents screen works from.
//
// The is_active flag is deliberately ignored. With ten terms loaded to the
// end of 2027 and nothing moving that flag, trusting it would leave the app
// on Term 3 2026 long after Term 4 had started. The dates decide instead,
// and the flag is neither read nor written.

export type TermRow = {
  term_name: string | null;
  term_start_date: string | null;
  term_end_date: string | null;
  p2_deadline: string | null;
};

// How close to the last loaded term's end date the warning appears.
export const TERM_RUNWAY_DAYS = 90;

function usable(term: TermRow): boolean {
  return Boolean(term.term_start_date && term.term_end_date);
}

// ISO dates compare correctly as strings, so no Date objects are needed and
// no timezone can drift the comparison.
export function pickTermForDate(terms: TermRow[], todayIso: string): TermRow | null {
  const dated = terms.filter(usable);
  if (!dated.length || !todayIso) return null;

  // Inside a term. If several somehow overlap, the latest start wins.
  const current = dated
    .filter((term) => term.term_start_date! <= todayIso && todayIso <= term.term_end_date!)
    .sort((a, b) => b.term_start_date!.localeCompare(a.term_start_date!));
  if (current[0]) return current[0];

  // A school holiday is a gap BETWEEN terms, so there has to be a term still
  // to come. Hold the term that just finished, which keeps the numbers
  // steady over the break rather than resetting them the day term ends.
  const laterExists = dated.some((term) => term.term_start_date! > todayIso);
  if (!laterExists) return null;

  const finished = dated
    .filter((term) => term.term_end_date! < todayIso)
    .sort((a, b) => b.term_end_date!.localeCompare(a.term_end_date!));
  return finished[0] ?? null;
}

export function lastTermEnd(terms: TermRow[]): string | null {
  const ends = terms.filter(usable).map((term) => term.term_end_date!);
  if (!ends.length) return null;
  return ends.reduce((latest, end) => (end > latest ? end : latest));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export type TermWarning = "none" | "ending-soon" | "expired";

// "expired" means the numbers on screen are already wrong, so it cannot be
// dismissed. "ending-soon" is a reminder with time still on the clock.
export function termWarning(terms: TermRow[], todayIso: string): TermWarning {
  const lastEnd = lastTermEnd(terms);
  if (!lastEnd || !todayIso) return "expired";
  if (todayIso > lastEnd) return "expired";
  return daysBetween(todayIso, lastEnd) <= TERM_RUNWAY_DAYS ? "ending-soon" : "none";
}
