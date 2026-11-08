import { describe, expect, it } from "bun:test";
import { mondayOf, normaliseParentName, shortStudentName } from "./focus";

describe("which Monday the week starts on", () => {
  it("walks back to the Monday of that week", () => {
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
    expect(mondayOf("2026-08-21")).toBe("2026-08-17");
    expect(mondayOf("2026-08-23")).toBe("2026-08-17");
    expect(mondayOf("2026-08-24")).toBe("2026-08-24");
  });

  it("holds across a month and a year boundary", () => {
    expect(mondayOf("2026-09-01")).toBe("2026-08-31");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });

  it("gives nothing for a date it cannot read", () => {
    expect(mondayOf("")).toBe("");
    expect(mondayOf("not a date")).toBe("");
  });
});

describe("matching a focus row to a student", () => {
  it("trims and lowercases, the way the Parents screen does", () => {
    expect(normaliseParentName("  Mei Chen ")).toBe("mei chen");
    expect(normaliseParentName("MEI CHEN")).toBe("mei chen");
    expect(normaliseParentName(null)).toBe("");
  });
});

describe("writing a student's name for a chip", () => {
  it("gives a first name and a single initial, with no full stop", () => {
    expect(shortStudentName("Ruby Chen")).toBe("Ruby C");
    expect(shortStudentName("Charlie Smith")).toBe("Charlie S");
    expect(shortStudentName("Ruby Chen")).not.toContain(".");
  });

  it("shows the first name alone when there is no surname", () => {
    expect(shortStudentName("Ruby")).toBe("Ruby");
    expect(shortStudentName("  Ruby  ")).toBe("Ruby");
  });

  it("takes the initial from the last name, not the middle one", () => {
    expect(shortStudentName("Mary Jane Wu")).toBe("Mary W");
  });

  it("upper cases the initial and keeps the first name as written", () => {
    expect(shortStudentName("ruby chen")).toBe("ruby C");
  });

  it("gives nothing for a blank name rather than throwing", () => {
    expect(shortStudentName("")).toBe("");
    expect(shortStudentName(null)).toBe("");
    expect(() => shortStudentName(undefined)).not.toThrow();
  });
});
