import { describe, expect, it } from "bun:test";
import {
  DETAIL_PLACEHOLDER,
  EDITABLE_FIELDS,
  ORIGINAL_TEMPLATES,
  PARENT_PLACEHOLDER,
  PREVIEW_DETAIL,
  PREVIEW_PARENT,
  PREVIEW_STUDENT,
  SMS_LIMIT,
  STUDENT_PLACEHOLDER,
  draftOf,
  fillPreview,
  missingPlaceholderWarning,
  missingPlaceholders,
  resetQuestion,
  resetTarget,
  sameDraft,
  smsCountLabel,
  smsOverLimit,
  updatePayload,
  type ReengagementTemplate,
  type TemplateDraft,
} from "./reengagement";

function template(over: Partial<ReengagementTemplate> = {}): ReengagementTemplate {
  return {
    id: 1,
    key: "gone-quiet",
    name: "Gone quiet",
    when_to_use: "When a family has not been in touch for a few weeks.",
    needs_detail: true,
    email_subject: "Thinking of {student_name}",
    email_body: "Hi {parent_first_name}, {student_name} has been going well. {detail}",
    sms_body: "Hi {parent_first_name}, a quick note about {student_name}.",
    sort_order: 1,
    ...over,
  };
}

const DRAFT: TemplateDraft = {
  email_subject: "New subject",
  email_body: "New body",
  sms_body: "New SMS",
};

describe("only the three editable columns are ever sent", () => {
  it("names exactly those three as editable", () => {
    expect([...EDITABLE_FIELDS]).toEqual(["email_subject", "email_body", "sms_body"]);
  });

  it("sends those three and the timestamp, and nothing else", () => {
    const payload = updatePayload(DRAFT, "2026-08-22T00:00:00.000Z");
    expect(Object.keys(payload).sort()).toEqual([
      "email_body",
      "email_subject",
      "sms_body",
      "updated_at",
    ]);
  });

  it("never sends id, key, name, when_to_use, needs_detail or sort_order", () => {
    const payload = updatePayload(DRAFT, "2026-08-22T00:00:00.000Z");
    for (const forbidden of ["id", "key", "name", "when_to_use", "needs_detail", "sort_order"]) {
      expect(forbidden in payload).toBe(false);
    }
  });

  it("sends what the draft holds, not what the row held", () => {
    const payload = updatePayload(DRAFT, "2026-08-22T00:00:00.000Z");
    expect(payload["email_subject"]).toBe("New subject");
    expect(payload["email_body"]).toBe("New body");
    expect(payload["sms_body"]).toBe("New SMS");
  });

  it("reads a row into a draft, treating a null column as empty", () => {
    expect(draftOf(template({ email_subject: null, email_body: null, sms_body: null }))).toEqual({
      email_subject: "",
      email_body: "",
      sms_body: "",
    });
  });
});

describe("one card at a time", () => {
  // The screen holds a draft per key, so editing or saving one cannot reach
  // another. These assert the comparison that decides which card is dirty.
  it("sees a card as unchanged until one of its own fields changes", () => {
    const loaded = draftOf(template());
    expect(sameDraft(loaded, { ...loaded })).toBe(true);
    expect(sameDraft(loaded, { ...loaded, sms_body: "different" })).toBe(false);
  });

  it("leaves the other cards untouched when one is edited", () => {
    const drafts: Record<string, TemplateDraft> = {
      a: draftOf(template({ key: "a" })),
      b: draftOf(template({ key: "b" })),
    };
    const edited = { ...drafts, a: { ...drafts["a"]!, email_body: "changed" } };
    expect(sameDraft(edited["b"]!, drafts["b"]!)).toBe(true);
    expect(sameDraft(edited["a"]!, drafts["a"]!)).toBe(false);
  });

  it("saves one card without touching what another would send", () => {
    const a = { ...DRAFT, email_body: "A body" };
    const b = { ...DRAFT, email_body: "B body" };
    expect(updatePayload(a, "t")["email_body"]).toBe("A body");
    expect(updatePayload(b, "t")["email_body"]).toBe("B body");
  });
});

describe("the missing placeholder warning", () => {
  it("says nothing when both are present", () => {
    expect(missingPlaceholders("Hi {parent_first_name}, {student_name} did well")).toEqual([]);
    expect(missingPlaceholderWarning("Hi {parent_first_name}, {student_name} did well")).toBeNull();
  });

  it("names the parent placeholder when it is missing", () => {
    const warning = missingPlaceholderWarning("Hi there, {student_name} did well");
    expect(missingPlaceholders("Hi there, {student_name} did well")).toEqual([PARENT_PLACEHOLDER]);
    expect(warning).toContain(PARENT_PLACEHOLDER);
    expect(warning).not.toContain(STUDENT_PLACEHOLDER);
  });

  it("names the student placeholder when it is missing", () => {
    const warning = missingPlaceholderWarning("Hi {parent_first_name}, all good");
    expect(warning).toContain(STUDENT_PLACEHOLDER);
    expect(warning).not.toContain(PARENT_PLACEHOLDER);
  });

  it("names both when both are missing", () => {
    const warning = missingPlaceholderWarning("Hello, everything is fine");
    expect(warning).toContain(PARENT_PLACEHOLDER);
    expect(warning).toContain(STUDENT_PLACEHOLDER);
  });

  it("says it will still save, because it never blocks one", () => {
    // A template with no name in it may well be deliberate.
    for (const body of ["", "Hello", "Hi {parent_first_name}"]) {
      const warning = missingPlaceholderWarning(body);
      expect(warning).not.toBeNull();
      expect(warning).toContain("still save");
      // The payload is built the same either way.
      expect(Object.keys(updatePayload({ ...DRAFT, email_body: body }, "t"))).toHaveLength(4);
    }
  });

  it("looks at the email body only, not the subject or the SMS", () => {
    expect(missingPlaceholders("{parent_first_name} {student_name}")).toEqual([]);
  });
});

describe("the SMS character count", () => {
  it("crosses at 160", () => {
    expect(SMS_LIMIT).toBe(160);
    expect(smsOverLimit("A".repeat(159))).toBe(false);
    expect(smsOverLimit("A".repeat(160))).toBe(false);
    expect(smsOverLimit("A".repeat(161))).toBe(true);
  });

  it("counts an empty message as none", () => {
    expect(smsOverLimit("")).toBe(false);
    expect(smsCountLabel("")).toBe("0 characters");
  });

  it("words one character in the singular", () => {
    expect(smsCountLabel("A")).toBe("1 character");
    expect(smsCountLabel("AB")).toBe("2 characters");
    expect(smsCountLabel("A".repeat(161))).toBe("161 characters");
  });

  it("counts what was typed, placeholders and all", () => {
    // The count is about the message as written, not as it will fill out.
    expect(smsCountLabel(PARENT_PLACEHOLDER)).toBe("19 characters");
  });
});

describe("the preview", () => {
  it("fills every placeholder", () => {
    const filled = fillPreview(
      `Hi ${PARENT_PLACEHOLDER}, ${STUDENT_PLACEHOLDER} did well. ${DETAIL_PLACEHOLDER}`,
    );
    expect(filled).toBe(`Hi ${PREVIEW_PARENT}, ${PREVIEW_STUDENT} did well. ${PREVIEW_DETAIL}`);
  });

  it("fills every occurrence, not just the first", () => {
    const filled = fillPreview(`${STUDENT_PLACEHOLDER} and ${STUDENT_PLACEHOLDER}`);
    expect(filled).toBe(`${PREVIEW_STUDENT} and ${PREVIEW_STUDENT}`);
  });

  it("keeps the line breaks", () => {
    expect(fillPreview("One\n\nTwo")).toBe("One\n\nTwo");
  });

  it("leaves wording with no placeholders alone", () => {
    expect(fillPreview("Nothing to fill here")).toBe("Nothing to fill here");
    expect(fillPreview("")).toBe("");
  });

  it("leaves an unknown placeholder as written rather than blanking it", () => {
    expect(fillPreview("Hi {nickname}")).toBe("Hi {nickname}");
  });
});

describe("resetting one card", () => {
  it("falls back to the wording as loaded while no original is held", () => {
    // The constant ships empty on purpose: inventing the wording would make
    // reset destroy the real templates rather than restore them.
    expect(Object.keys(ORIGINAL_TEMPLATES)).toHaveLength(0);
    const loaded = draftOf(template());
    const target = resetTarget("gone-quiet", loaded);
    expect(target.source).toBe("loaded");
    expect(target.draft).toEqual(loaded);
  });

  it("uses the original once one is held for that key", () => {
    const original: TemplateDraft = {
      email_subject: "Original subject",
      email_body: "Original body",
      sms_body: "Original SMS",
    };
    ORIGINAL_TEMPLATES["gone-quiet"] = original;
    try {
      const target = resetTarget("gone-quiet", draftOf(template()));
      expect(target.source).toBe("original");
      expect(target.draft).toEqual(original);
      // And only for that key.
      expect(resetTarget("something-else", draftOf(template())).source).toBe("loaded");
    } finally {
      delete ORIGINAL_TEMPLATES["gone-quiet"];
    }
  });

  it("restores only the card it was asked about", () => {
    const drafts: Record<string, TemplateDraft> = {
      a: { ...DRAFT, email_body: "A edited" },
      b: { ...DRAFT, email_body: "B edited" },
    };
    const loadedA = draftOf(template({ key: "a" }));
    const after = { ...drafts, a: resetTarget("a", loadedA).draft };
    expect(after["a"]).toEqual(loadedA);
    expect(after["b"]).toEqual(drafts["b"]);
  });

  it("asks in plain words, saying which wording it will put back", () => {
    expect(resetQuestion("Gone quiet", "original")).toContain("original wording");
    expect(resetQuestion("Gone quiet", "loaded")).toContain("when this screen opened");
    for (const source of ["original", "loaded"] as const) {
      expect(resetQuestion("Gone quiet", source)).toContain("Gone quiet");
    }
  });
});
