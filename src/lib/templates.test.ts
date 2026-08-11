import { describe, expect, it } from "bun:test";
import {
  firstName,
  greetingName,
  mailtoHref,
  parentFirstNames,
  populateTemplate,
  smsHref,
} from "./templates";

describe("first names only", () => {
  it("keeps the first word and drops every surname", () => {
    expect(firstName("Grace Chen")).toBe("Grace");
    expect(firstName("Thao Nguyen Vandenberg")).toBe("Thao");
    expect(firstName("  Eleni   Papadopoulos  ")).toBe("Eleni");
    expect(firstName("Abena")).toBe("Abena");
  });

  it("returns nothing for a missing name and greets a stranger as there", () => {
    expect(firstName(null)).toBe("");
    expect(firstName(undefined)).toBe("");
    expect(firstName("   ")).toBe("");
    expect(greetingName(null)).toBe("there");
    expect(greetingName("Grace Chen")).toBe("Grace");
  });
});

describe("template placeholders", () => {
  it("fills parent and student placeholders with first names only", () => {
    const body = "Hi {{parent_name}}, a quick note about {{student_name}}.";
    expect(populateTemplate(body, firstName("Grace Chen"), firstName("Aiden Chen"))).toBe(
      "Hi Grace, a quick note about Aiden.",
    );
  });

  it("accepts loose spacing and any case in the placeholder", () => {
    const body = "{{ parent_name }} and {{PARENT_NAME}} and {{Student_Name}}";
    expect(populateTemplate(body, "Grace", "Aiden")).toBe("Grace and Grace and Aiden");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(populateTemplate("{{parent_name}} {{parent_name}}", "Grace", "Aiden")).toBe(
      "Grace Grace",
    );
  });

  it("treats a missing template body as empty text", () => {
    expect(populateTemplate(null, "Grace", "Aiden")).toBe("");
  });
});

describe("the message links", () => {
  it("targets the parent phone and encodes the body", () => {
    expect(smsHref("0400 111 222", "Hi Grace, all good?")).toBe(
      "sms:0400111222?body=Hi%20Grace%2C%20all%20good%3F",
    );
  });

  it("targets the parent email and encodes the subject and body", () => {
    expect(mailtoHref("grace@example.com", "Aiden update", "Hi Grace")).toBe(
      "mailto:grace@example.com?subject=Aiden%20update&body=Hi%20Grace",
    );
  });
});

describe("the export list", () => {
  it("gives first names only, never a surname and never an email", () => {
    const names = parentFirstNames(["Grace Chen", "Thao Nguyen Vandenberg"]);
    expect(names).toEqual(["Grace", "Thao"]);
    expect(names.join(", ")).not.toContain("@");
  });

  it("counts a parent with two children once", () => {
    expect(parentFirstNames(["Grace Chen", "grace chen", "  Grace Chen "])).toEqual(["Grace"]);
  });

  it("keeps two different parents who share a first name", () => {
    expect(parentFirstNames(["Sarah Ford", "Sarah Alvarez"])).toEqual(["Sarah", "Sarah"]);
  });

  it("skips students with no parent name recorded", () => {
    expect(parentFirstNames([null, "", "   ", "Abena Osei"])).toEqual(["Abena"]);
  });
});
