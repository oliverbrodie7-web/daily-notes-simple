// The "Contact these first" card under the coverage meter.
//
// It is the overlap of two things the screen already works out: the red
// coverage group (needs a touch point) and the engagement (has the parent
// emailed this term). A family in both is engaged and ignored: they reached
// out and still have no touch point, so they are the ones to contact first.

import type { CoverageGroup } from "./coverage";
import { lastEmailLine } from "./engagement";

export type ContactFirstInput = {
  id: number | string;
  studentName: string;
  parentName: string | null;
  parentPhone: string | null;
  coverage: CoverageGroup;
  // Days since the parent's most recent email this term, from engagement.ts.
  // Null only when they have not emailed at all this term, which is the
  // signal that separates "engaged and ignored" from simply "ignored".
  daysSinceLastEmail: number | null;
};

export type ContactFirstFamily = {
  id: string;
  studentName: string;
  parentName: string | null;
  parentPhone: string | null;
  // The short reason, from the same wording the engagement panel uses.
  reason: string;
};

// Red group families whose parent has emailed this term, worst wait first:
// the longer since their email, the longer they have been left without a
// touch point. Ties fall back to the student name so the order is steady.
export function contactFirstFamilies(rows: ContactFirstInput[]): ContactFirstFamily[] {
  return rows
    .filter((row) => row.coverage === "red" && row.daysSinceLastEmail !== null)
    .sort((a, b) => {
      const byWait = (b.daysSinceLastEmail ?? 0) - (a.daysSinceLastEmail ?? 0);
      return byWait !== 0 ? byWait : a.studentName.localeCompare(b.studentName);
    })
    .map((row) => ({
      id: String(row.id),
      studentName: row.studentName,
      parentName: row.parentName,
      parentPhone: row.parentPhone,
      reason: lastEmailLine(row.daysSinceLastEmail),
    }));
}

export const CONTACT_FIRST_TITLE = "Contact these first";
export const CONTACT_FIRST_CLEAR = "All caught up";

// The footer link wording. N is every family that needs a touch point, the
// whole red group, not just the engaged ones listed above it.
export function seeAllLabel(redTotal: number): string {
  return `See all ${redTotal} who need a touch point`;
}
