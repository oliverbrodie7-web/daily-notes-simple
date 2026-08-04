const SYDNEY_TIME_ZONE = "Australia/Sydney";

// Today's date in Sydney as a YYYY-MM-DD string, whatever timezone the
// browser itself is in.
export function sydneyTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

// Today in Sydney like "Monday 3 August" for the header.
export function formatSydneyHeaderDate(): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}
