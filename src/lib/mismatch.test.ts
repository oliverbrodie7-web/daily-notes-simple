import { describe, expect, it } from "bun:test";
import {
  SUGGESTION_FLOOR,
  normaliseName,
  rankStudents,
  scoreStudent,
  searchStudents,
  similarity,
} from "./mismatch";

const ROSTER = [
  { id: 1, student_name: "Alysha Nguyen", parent_name: "Thao Nguyen" },
  { id: 2, student_name: "Aiden Chen", parent_name: "Grace Chen" },
  { id: 3, student_name: "Freya Papadopoulos", parent_name: "Eleni Papadopoulos" },
  { id: 4, student_name: "Hugo Martins", parent_name: "Ines Martins" },
  { id: 5, student_name: "Daniel O'Brien", parent_name: "Siobhan O'Brien" },
];

function booking(student_name_given: string | null, invitee_name: string | null = null) {
  return { student_name_given, invitee_name };
}

describe("normalising a name", () => {
  it("trims, lowercases, collapses spaces and drops punctuation", () => {
    expect(normaliseName("  Daniel   O'Brien ")).toBe("daniel o brien");
    expect(normaliseName("ALYSHA-NGUYEN")).toBe("alysha nguyen");
    expect(normaliseName(null)).toBe("");
  });
});

describe("similarity", () => {
  it("scores an exact match as one", () => {
    expect(similarity("Alysha Nguyen", "alysha nguyen")).toBe(1);
  });

  it("scores a one letter slip inside a first name very highly", () => {
    expect(similarity("Alyssa", "Alysha Nguyen")).toBeGreaterThan(0.75);
  });

  it("scores an unrelated name low", () => {
    expect(similarity("Alyssa", "Hugo Martins")).toBeLessThan(0.4);
  });

  it("scores nothing when either side is empty", () => {
    expect(similarity("", "Alysha")).toBe(0);
    expect(similarity(null, "Alysha")).toBe(0);
  });
});

describe("ranking students for a booking", () => {
  it("puts the near miss first: Alyssa surfaces Alysha", () => {
    const ranked = rankStudents(booking("Alyssa"), ROSTER);
    expect(ranked[0]?.student.student_name).toBe("Alysha Nguyen");
  });

  it("matches on the parent name when the parent typed their own name", () => {
    const ranked = rankStudents(booking("Grace Chen"), ROSTER);
    expect(ranked[0]?.student.student_name).toBe("Aiden Chen");
  });

  it("uses the invitee name when the student field is empty", () => {
    const ranked = rankStudents(booking("", "Eleni Papadopoulos"), ROSTER);
    expect(ranked[0]?.student.student_name).toBe("Freya Papadopoulos");
  });

  it("handles punctuation differences", () => {
    const ranked = rankStudents(booking("Daniel OBrien"), ROSTER);
    expect(ranked[0]?.student.student_name).toBe("Daniel O'Brien");
  });

  it("offers nothing when the name resembles nobody", () => {
    expect(rankStudents(booking("Zxqwv Blorptian"), ROSTER)).toEqual([]);
  });

  it("offers nothing at all for an empty booking rather than a random guess", () => {
    expect(rankStudents(booking(null, null), ROSTER)).toEqual([]);
  });

  it("returns at most the limit, best first", () => {
    const ranked = rankStudents(booking("Martins"), ROSTER, 2);
    expect(ranked.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it("never suggests anything below the floor", () => {
    for (const entry of rankStudents(booking("Alyssa"), ROSTER, 5)) {
      expect(entry.score).toBeGreaterThanOrEqual(SUGGESTION_FLOOR);
    }
  });

  it("scores the right student above every other student on the roster", () => {
    const target = ROSTER[0]!;
    const best = scoreStudent(booking("Alyssa Nguyen"), target);
    for (const other of ROSTER.slice(1)) {
      expect(best).toBeGreaterThan(scoreStudent(booking("Alyssa Nguyen"), other));
    }
  });
});

describe("the search fallback", () => {
  it("finds by part of a student or parent name", () => {
    expect(searchStudents("papa", ROSTER).map((s) => s.id)).toEqual([3]);
    expect(searchStudents("ines", ROSTER).map((s) => s.id)).toEqual([4]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchStudents("   ", ROSTER)).toEqual([]);
  });
});
