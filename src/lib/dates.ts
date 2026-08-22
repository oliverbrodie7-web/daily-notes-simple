const SYDNEY_TIME_ZONE = "Australia/Sydney";

// A date's Sydney calendar day as a YYYY-MM-DD string, whatever timezone the
// browser itself is in.
export function sydneyDateIso(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Today's date in Sydney as a YYYY-MM-DD string.
export function sydneyTodayIso(): string {
  return sydneyDateIso(new Date());
}

// Tomorrow's date in Sydney as a YYYY-MM-DD string.
export function sydneyTomorrowIso(): string {
  const [year, month, day] = sydneyTodayIso().split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

// The hour of a timestamp on Sydney's clock, 0 to 23.
export function sydneyHourOf(timestamp: string | Date): number {
  const hour = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).format(new Date(timestamp));
  return Number(hour) % 24;
}

// A timestamp as a 12 hour Sydney time like 4:12 pm. Some ICU builds put a
// narrow no break space before the am or pm marker, so normalise it.
export function formatSydneyTime(timestamp: string | Date | null | undefined): string {
  const at = timestamp instanceof Date ? timestamp : new Date((timestamp ?? "").toString().trim());
  if (Number.isNaN(at.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
  return formatted.replace(/[\u202f\u00a0]/g, " ").toLowerCase();
}

// The three formatters below take a date column value, YYYY-MM-DD, and used
// to glue T00:00:00Z onto whatever they were handed. A full timestamp fed to
// one of them produced an unparseable string, and Intl throws on an invalid
// date rather than returning a placeholder, which took the whole page down
// through the root error boundary.
//
// They now narrow to the calendar day themselves, so a caller never has to
// know which shape a column holds, and they return an empty string rather
// than throwing when they still cannot read the value. A missing date on one
// line is a small problem. A blank page is not.
function calendarDay(value: string | null | undefined): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  // The first ten characters of an ISO date or timestamp are its calendar
  // day. Anything else is handed to Date as it stands, which covers the
  // shapes Postgres returns with a space instead of a T.
  const day = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
  const anchored = new Date(`${day}T00:00:00Z`);
  if (!Number.isNaN(anchored.getTime())) return anchored;
  const loose = new Date(trimmed);
  return Number.isNaN(loose.getTime()) ? null : loose;
}

function formatSydneyDayMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

// Today in Sydney like "Monday 3 August" for the header.
export function formatSydneyHeaderDate(): string {
  return formatSydneyDayMonth(new Date());
}

// A date column value like "Monday 3 August". Anchoring to UTC midnight
// keeps the Sydney rendering on the same calendar day.
export function formatSydneyFullDate(dateIso: string | null | undefined): string {
  const date = calendarDay(dateIso);
  return date ? formatSydneyDayMonth(date) : "";
}

// A short day and month, for the last contact line on a roster row.
export function formatSydneyShortDate(dateIso: string | null | undefined): string {
  const date = calendarDay(dateIso);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${day} ${month}`;
}

// Day, month and year with no weekday, for the term runway banner: the year
// matters there because the date is often more than a year away.
export function formatSydneyDateWithYear(dateIso: string | null | undefined): string {
  const date = calendarDay(dateIso);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}
