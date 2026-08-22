import { describe, expect, it } from "bun:test";
import {
  formatSydneyDateWithYear,
  formatSydneyFullDate,
  formatSydneyShortDate,
  formatSydneyTime,
} from "./dates";
import { engagementByEmail, type ParentEmail } from "./engagement";

const FORMATTERS = [
  ["formatSydneyShortDate", formatSydneyShortDate],
  ["formatSydneyFullDate", formatSydneyFullDate],
  ["formatSydneyDateWithYear", formatSydneyDateWithYear],
] as const;

describe("the date formatters read a plain date", () => {
  it("formats a date column value", () => {
    expect(formatSydneyShortDate("2026-08-18")).toBe("18 Aug");
    expect(formatSydneyFullDate("2026-08-18")).toBe("Tuesday 18 August");
    expect(formatSydneyDateWithYear("2026-08-18")).toBe("18 August 2026");
  });
});

describe("the date formatters read a full timestamp", () => {
  // This is the shape that took the whole page down: the formatters used to
  // glue T00:00:00Z onto a value that already carried a time.
  const stamps = [
    "2026-08-18T04:12:33.123456+00:00",
    "2026-08-18T04:12:33Z",
    "2026-08-18 04:12:33+00",
    "2026-08-18T23:59:59.999Z",
  ];

  it("narrows to the calendar day rather than throwing", () => {
    for (const stamp of stamps) {
      expect(() => formatSydneyShortDate(stamp)).not.toThrow();
      expect(formatSydneyShortDate(stamp)).toBe("18 Aug");
      expect(formatSydneyFullDate(stamp)).toBe("Tuesday 18 August");
      expect(formatSydneyDateWithYear(stamp)).toBe("18 August 2026");
    }
  });
});

describe("the date formatters never throw", () => {
  const rubbish = ["", "   ", null, undefined, "not a date", "2026-13-45", "T00:00:00Z", "{}"];

  it("returns an empty string for anything it cannot read", () => {
    for (const [name, format] of FORMATTERS) {
      for (const value of rubbish) {
        expect(() => format(value)).not.toThrow();
        expect(`${name}: ${format(value)}`).toBe(`${name}: `);
      }
    }
  });

  it("recovers the day from the very string that used to crash the page", () => {
    // The old formatter built this by gluing T00:00:00Z onto a timestamp.
    // Handed it now, it reads the leading calendar day rather than throwing.
    const doubled = "2026-08-18T04:12:33.123456+00:00T00:00:00Z";
    expect(() => formatSydneyShortDate(doubled)).not.toThrow();
    expect(formatSydneyShortDate(doubled)).toBe("18 Aug");
  });

  it("returns an empty string from the time formatter too", () => {
    for (const value of rubbish) {
      expect(() => formatSydneyTime(value)).not.toThrow();
      expect(formatSydneyTime(value)).toBe("");
    }
    expect(formatSydneyTime("2026-08-18T04:12:33Z")).toContain("pm");
  });

  it("never returns the string Invalid Date", () => {
    for (const [, format] of FORMATTERS) {
      for (const value of rubbish) expect(format(value)).not.toContain("Invalid");
    }
  });
});

// The seam that broke. Every scoring test passed while the feature was
// unusable, because nothing ever tried to display the data it produced.
describe("every date an Engagement carries can be displayed", () => {
  function email(receivedAt: string, is_touch_point_reply = false): ParentEmail {
    return {
      parent_email: "a@b.com",
      received_at: receivedAt,
      subject: "Quick question",
      is_touch_point_reply,
    };
  }

  const built = engagementByEmail(
    [
      email("2026-08-18T04:12:33.123456+00:00"),
      email("2026-08-11T22:45:00Z", true),
      email("2026-08-04T00:00:00+10:00"),
      email("2026-08-20 09:30:00+00"),
    ],
    { termStart: "2026-07-20", termEnd: "2026-09-25", now: new Date("2026-08-21T09:00:00Z") },
  );

  const entry = built.get("a@b.com");

  it("built the entry the panel would render", () => {
    expect(entry?.emails.length).toBeGreaterThan(0);
  });

  it("formats every receivedAt into something sensible, never throwing", () => {
    for (const mail of entry?.emails ?? []) {
      expect(() => formatSydneyShortDate(mail.receivedAt)).not.toThrow();
      const shown = formatSydneyShortDate(mail.receivedAt);
      expect(shown).not.toBe("");
      expect(shown).not.toContain("Invalid");
      // A day and a short month, which is what the panel puts on the row.
      expect(shown).toMatch(/^\d{1,2} [A-Za-z]{3,4}\.?$/);
    }
  });

  it("formats them the same whether the panel narrows first or not", () => {
    // The panel slices to the calendar day; the formatter narrows anyway.
    for (const mail of entry?.emails ?? []) {
      expect(formatSydneyShortDate(mail.receivedAt.slice(0, 10))).toBe(
        formatSydneyShortDate(mail.receivedAt),
      );
    }
  });
});
