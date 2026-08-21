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
export function formatSydneyTime(timestamp: string | Date): string {
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
  return formatted.replace(/[\u202f\u00a0]/g, " ").toLowerCase();
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

// A YYYY-MM-DD date column value like "Monday 3 August". Anchoring to UTC
// midnight keeps the Sydney rendering on the same calendar day.
export function formatSydneyFullDate(dateIso: string): string {
  return formatSydneyDayMonth(new Date(`${dateIso}T00:00:00Z`));
}

// A short day and month, for the last contact line on a roster row.
export function formatSydneyShortDate(dateIso: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(`${dateIso}T00:00:00Z`));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${day} ${month}`;
}
