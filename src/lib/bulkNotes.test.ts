import { describe, expect, it } from "bun:test";
import {
  batchCount,
  cellLines,
  decodeEntities,
  duplicateWarning,
  duplicateWarnings,
  htmlToText,
  inBatch,
  noteKey,
  noteTextFrom,
  ordinal,
  parseBulkDocument,
  readDocument,
  squash,
  toCards,
  stripTutorInitials,
  topicToWords,
} from "./bulkNotes";

// Fixtures are built the way mammoth really writes a document, with empty
// paragraphs kept and the greater than sign escaped, so the tests are honest
// about what the app actually sees.
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function asDocument(lines: string[]): string {
  return lines.map((line) => `<p>${escape(line)}</p>`).join("");
}

// One cell per student, its lines joined by soft breaks inside a single
// paragraph, which is what pressing shift and enter in Word produces.
function asTable(cells: string[][]): string {
  const rows = cells
    .map((lines) => {
      const body = lines.length === 0 ? "<p></p>" : `<p>${lines.map(escape).join("<br />")}</p>`;
      return `<tr><td>${body}</td></tr>`;
    })
    .join("");
  return `<table>${rows}</table>`;
}

const THREE_STUDENTS = asDocument([
  "Alice D",
  "Multiply > Algorithm",
  "Worked through the harder ones without help. JD",
  "",
  "Bob T",
  "Decimals",
  "Slower today but got there in the end. E Lov",
  "",
  "Charlie S",
  "Fractions > Adding > Unlike",
  "Needed a reminder about common denominators. AB",
]);

describe("reading the document", () => {
  it("puts the paragraphs back, blanks and all", () => {
    expect(readDocument(asDocument(["One", "", "Two"])).lines).toEqual(["One", "", "Two", ""]);
  });

  it("trims each line, so a stray space is not a line of its own", () => {
    expect(readDocument("<p>Alice D  </p><p>   </p><p>Bob T</p>").lines).toEqual([
      "Alice D",
      "",
      "Bob T",
      "",
    ]);
  });

  it("finds no cells in a document with no table", () => {
    expect(readDocument(asDocument(["One", "", "Two"])).cells).toEqual([]);
  });

  it("takes every cell in document order, breaks and all", () => {
    const html = asTable([["Alice D", "Decimals", "All good. JD"], [], ["Bob T"]]);
    expect(readDocument(html).cells).toEqual([
      "Alice D\nDecimals\nAll good. JD\n",
      "\n",
      "Bob T\n",
    ]);
  });

  it("keeps the paragraphs outside a table separate from the cells", () => {
    const html = `<p>Loose</p>${asTable([["Alice D", "Decimals", "All good. JD"]])}<p></p>`;
    const shape = readDocument(html);
    expect(shape.cells).toHaveLength(1);
    expect(shape.lines).toEqual(["Loose", "", ""]);
  });

  it("drops formatting without dropping the words", () => {
    expect(htmlToText("<p><strong>Alice D</strong><br /><em>Decimals</em></p>")).toBe(
      "Alice D\nDecimals\n",
    );
  });

  it("puts the greater than sign back", () => {
    expect(decodeEntities("Multiply &gt; Algorithm")).toBe("Multiply > Algorithm");
    expect(decodeEntities("Tom &amp; Jerry &#39;s &#x41;")).toBe("Tom & Jerry 's A");
  });

  it("does not let a table inside a cell end the outer one early", () => {
    const inner = "<table><tr><td><p>Nested</p></td></tr></table>";
    const html = `<table><tr><td><p>Alice D<br />Decimals<br />All good. JD</p>${inner}</td></tr><tr><td><p>Bob T<br />Fractions<br />Fine. AB</p></td></tr></table>`;
    expect(readDocument(html).cells).toHaveLength(2);
  });

  it("splits a cell into its lines and drops the blank ones", () => {
    expect(cellLines("\nAlice D\n\n  \nDecimals\nAll good. JD\n")).toEqual([
      "Alice D",
      "Decimals",
      "All good. JD",
    ]);
  });
});

describe("a table document", () => {
  it("makes one student out of every cell", () => {
    const html = asTable([
      ["Alice D", "Decimals", "All good. JD"],
      ["Bob T", "Fractions", "Fine. AB"],
      ["Charlie S", "Times tables", "Quick today. E Lov"],
    ]);
    const result = parseBulkDocument(html);
    expect(result.ok).toBe(true);
    expect(result.students.map((student) => student.name)).toEqual([
      "Alice D",
      "Bob T",
      "Charlie S",
    ]);
  });

  it("splits the soft line breaks inside a cell", () => {
    const html = asTable([["Alice D", "Multiply > Algorithm", "Worked hard today. JD"]]);
    const student = parseBulkDocument(html).students[0];
    expect(student?.name).toBe("Alice D");
    expect(student?.topic).toBe("Multiply > Algorithm");
    expect(student?.note).toBe("Worked hard today. JD");
    expect(student?.noteText).toBe("Multiply, Algorithm. Worked hard today.");
  });

  it("discards the empty lines before taking the first, the last and the middle", () => {
    const html = asTable([["", "Alice D", "", "Decimals", "", "All good. JD", ""]]);
    const student = parseBulkDocument(html).students[0];
    expect(student?.name).toBe("Alice D");
    expect(student?.topic).toBe("Decimals");
    expect(student?.note).toBe("All good. JD");
  });

  it("joins the middle lines of a four line cell with a comma", () => {
    const html = asTable([["Alice D", "Fractions", "Adding", "All good. JD"]]);
    const student = parseBulkDocument(html).students[0];
    expect(student?.topic).toBe("Fractions, Adding");
    expect(student?.noteText).toBe("Fractions, Adding. All good.");
  });

  it("ignores an empty cell rather than refusing it", () => {
    const html = asTable([["Alice D", "Decimals", "All good. JD"], [], ["", "  ", ""]]);
    const result = parseBulkDocument(html);
    expect(result.ok).toBe(true);
    expect(result.students).toHaveLength(1);
  });

  it("refuses a cell with two lines, naming the cell", () => {
    const html = asTable([
      ["Alice D", "Decimals", "All good. JD"],
      [],
      ["Bob T", "Fractions"],
      ["Charlie S", "Times tables", "Quick today. AB"],
    ]);
    const result = parseBulkDocument(html);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.where).toBe("cell");
    expect(result.at).toBe(3);
    expect(result.text).toBe("Bob T\nFractions");
    expect(result.reason).toBe("It holds only two lines, and a student needs three.");
    // The good cell before it is still offered, and the one after is not read.
    expect(result.students.map((student) => student.name)).toEqual(["Alice D"]);
  });

  it("refuses a cell with one line, naming the cell", () => {
    const result = parseBulkDocument(asTable([["Alice D"]]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.at).toBe(1);
    expect(result.reason).toBe("It holds only one line, and a student needs three.");
  });

  it("refuses a table with nothing in any cell", () => {
    const result = parseBulkDocument(asTable([[], []]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toBe("Every cell in this document is empty.");
  });

  it("uses the table and ignores loose paragraphs around it", () => {
    const html = [
      asDocument(["Zoe Q", "Algebra", "Not a real student. XX", ""]),
      asTable([["Alice D", "Decimals", "All good. JD"]]),
      asDocument(["", "Yves R", "Geometry", "Also not real. YY"]),
    ].join("");
    const result = parseBulkDocument(html);
    expect(result.ok).toBe(true);
    expect(result.students.map((student) => student.name)).toEqual(["Alice D"]);
  });

  it("records the cell each student came from", () => {
    const html = asTable([[], ["Alice D", "Decimals", "All good. JD"]]);
    expect(parseBulkDocument(html).students[0]?.at).toBe(2);
  });
});

describe("the real table example", () => {
  // Exactly what mammoth returned for the document Ollie described, empty
  // paragraphs kept, copied out of the reader rather than imagined.
  const REAL =
    "<p></p><p></p><table><tr><td><p>Alice D<br /><br /><br />Multiply &gt; Algorithm<br />Worked through the harder ones without help today. JD</p></td></tr><tr><td><p><br />Alyssa H<br /><br />Decimals<br />Slower today but got there in the end. E Lov</p></td></tr><tr><td><p></p></td></tr></table><p></p><p></p>";

  const result = parseBulkDocument(REAL);

  it("finds exactly two students", () => {
    expect(result.ok).toBe(true);
    expect(result.students.map((student) => student.name)).toEqual(["Alice D", "Alyssa H"]);
  });

  it("reads both topics, with the greater than sign turned into a comma", () => {
    expect(result.students.map((student) => student.noteText)).toEqual([
      "Multiply, Algorithm. Worked through the harder ones without help today.",
      "Decimals. Slower today but got there in the end.",
    ]);
  });

  it("ignores the third cell and the four empty paragraphs", () => {
    expect(result.students).toHaveLength(2);
  });
});

describe("saying where it stopped", () => {
  it("counts in words up to ten", () => {
    expect(ordinal(1)).toBe("first");
    expect(ordinal(4)).toBe("fourth");
    expect(ordinal(10)).toBe("tenth");
  });

  it("falls back to digits past that", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(24)).toBe("24th");
  });
});
describe("a well formed document", () => {
  const result = parseBulkDocument(THREE_STUDENTS);

  it("reads every student", () => {
    expect(result.ok).toBe(true);
    expect(result.students).toHaveLength(3);
  });

  it("keeps the name exactly as written", () => {
    expect(result.students.map((student) => student.name)).toEqual([
      "Alice D",
      "Bob T",
      "Charlie S",
    ]);
  });

  it("joins the topic and the note, with the greater than sign replaced", () => {
    expect(result.students[0]?.noteText).toBe(
      "Multiply, Algorithm. Worked through the harder ones without help.",
    );
    expect(result.students[2]?.noteText).toBe(
      "Fractions, Adding, Unlike. Needed a reminder about common denominators.",
    );
  });

  it("strips the tutor initials, one word or two", () => {
    expect(result.students[0]?.noteText.endsWith("without help.")).toBe(true);
    expect(result.students[1]?.noteText).toBe("Decimals. Slower today but got there in the end.");
  });

  it("records the line each student started on", () => {
    expect(result.students.map((student) => student.at)).toEqual([1, 5, 9]);
  });

  it("tolerates trailing whitespace and empty paragraphs at the end of the file", () => {
    const padded = `${THREE_STUDENTS}${asDocument(["", "   ", "", ""])}`;
    const same = parseBulkDocument(padded);
    expect(same.ok).toBe(true);
    expect(same.students).toHaveLength(3);
    expect(same.students[2]?.name).toBe("Charlie S");
  });

  it("tolerates blank lines before the first student", () => {
    const led = parseBulkDocument(asDocument(["", ""]) + THREE_STUDENTS);
    expect(led.ok).toBe(true);
    expect(led.students).toHaveLength(3);
    // The line numbers still point at the real document.
    expect(led.students[0]?.at).toBe(3);
  });

  it("reads a single student on its own", () => {
    const one = parseBulkDocument(asDocument(["Alice D", "Decimals", "All good. JD"]));
    expect(one.ok).toBe(true);
    expect(one.students).toHaveLength(1);
  });
});

describe("a document that does not parse", () => {
  it("refuses a missing blank line, naming the line and its text", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "Bob T",
      "Fractions",
      "Fine. AB",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.at).toBe(4);
    expect(result.text).toBe("Bob T");
    expect(result.reason).toBe("Expected a blank line here, before the next student.");
    // Everything read cleanly before it stopped is still offered.
    expect(result.students).toHaveLength(1);
    expect(result.students[0]?.name).toBe("Alice D");
  });

  it("refuses a two line student in the middle", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "",
      "Bob T",
      "Fractions",
      "",
      "Charlie S",
      "Times tables",
      "Quick today. AB",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.at).toBe(7);
    expect(result.text).toBe("");
    expect(result.reason).toBe("Expected the note on this line, under the topic.");
    expect(result.students).toHaveLength(1);
  });

  it("refuses a two line student at the end of the document", () => {
    const doc = asDocument(["Alice D", "Decimals", "All good. JD", "", "Bob T", "Fractions"]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.at).toBe(5);
    expect(result.text).toBe("Bob T");
    expect(result.reason).toBe("This student has only two lines, and the document ends here.");
    expect(result.students).toHaveLength(1);
  });

  it("refuses a one line student at the end of the document", () => {
    const doc = asDocument(["Alice D", "Decimals", "All good. JD", "", "Bob T"]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toBe("This student has only one line, and the document ends here.");
  });

  it("refuses two blank lines between students", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "",
      "",
      "Bob T",
      "Fractions",
      "Fine. AB",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.at).toBe(5);
    expect(result.reason).toBe("Expected the next student's name here, but this line is blank.");
  });

  it("refuses a document with no text in it", () => {
    const result = parseBulkDocument(asDocument(["", "  ", ""]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.students).toHaveLength(0);
    expect(result.reason).toBe("There is no text in this document.");
  });

  it("never reads past the line that stopped it", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "Bob T",
      "",
      "Charlie S",
      "Times tables",
      "Quick today. AB",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    // Charlie sits further down and is well formed, and is still not read.
    expect(result.students).toHaveLength(1);
  });
});

describe("the topic", () => {
  it("replaces the greater than sign with a comma and a space", () => {
    expect(topicToWords("Multiply > Algorithm")).toBe("Multiply, Algorithm");
    expect(topicToWords("Multiply>Algorithm")).toBe("Multiply, Algorithm");
    expect(topicToWords("A > B > C")).toBe("A, B, C");
  });

  it("leaves a plain topic alone", () => {
    expect(topicToWords("Decimals")).toBe("Decimals");
  });

  it("does not double the full stop", () => {
    expect(noteTextFrom("Decimals.", "All good. JD")).toBe("Decimals. All good.");
  });
});

describe("the tutor initials", () => {
  it("strips one short word", () => {
    expect(stripTutorInitials("Worked hard today. JD")).toBe("Worked hard today.");
  });

  it("strips two short words", () => {
    expect(stripTutorInitials("Worked hard today. E Lov")).toBe("Worked hard today.");
  });

  it("strips initials written with full stops", () => {
    expect(stripTutorInitials("Worked hard today. J.D.")).toBe("Worked hard today.");
  });

  it("does not destroy a one word note", () => {
    expect(stripTutorInitials("JD")).toBe("JD");
    expect(stripTutorInitials("Excellent")).toBe("Excellent");
  });

  it("does not destroy a note that is nothing but initials", () => {
    expect(stripTutorInitials("E Lov")).toBe("E Lov");
  });

  it("leaves ordinary lowercase words alone", () => {
    expect(stripTutorInitials("Great work")).toBe("Great work");
    expect(stripTutorInitials("He did well")).toBe("He did well");
  });

  it("leaves a longer word alone, capital or not", () => {
    expect(stripTutorInitials("Worked hard with Ella")).toBe("Worked hard with Ella");
  });

  it("tidies a dash left behind by the initials", () => {
    expect(stripTutorInitials("Worked hard today - JD")).toBe("Worked hard today");
  });
});

describe("duplicates inside one document", () => {
  it("warns above the first appearance only", () => {
    const students = [
      { name: "Alice D" },
      { name: "Bob T" },
      { name: "alice  d" },
      { name: "Charlie S" },
    ];
    const warnings = duplicateWarnings(students);
    expect([...warnings.keys()]).toEqual([0]);
    expect(warnings.get(0)).toBe(
      "Alice D appears twice in this document. Two notes means two parent emails.",
    );
  });

  it("uses the real count", () => {
    expect(duplicateWarning("Alice D", 3)).toBe(
      "Alice D appears three times in this document. Three notes means three parent emails.",
    );
  });

  it("says nothing when every student is written once", () => {
    expect(duplicateWarnings([{ name: "Alice D" }, { name: "Bob T" }]).size).toBe(0);
  });

  it("finds a duplicate in a real document", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "",
      "Alice D",
      "Fractions",
      "Also good. JD",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(true);
    expect(duplicateWarnings(result.students).get(0)).toContain("appears twice");
  });
});

describe("already added today", () => {
  it("matches after trimming and collapsing whitespace", () => {
    expect(squash("  Alice   D ")).toBe("alice d");
    expect(noteKey(" Alice  D ", "Decimals.  All good.")).toBe(
      noteKey("alice d", "decimals. all good."),
    );
  });

  it("marks a note that is already there and leaves the others alone", () => {
    const doc = asDocument([
      "Alice D",
      "Decimals",
      "All good. JD",
      "",
      "Bob T",
      "Fractions",
      "Fine. AB",
    ]);
    const result = parseBulkDocument(doc);
    expect(result.ok).toBe(true);
    const existing = new Set([noteKey("Alice  D", " Decimals. All good. ")]);
    const flagged = result.students.map((student) =>
      existing.has(noteKey(student.name, student.noteText)),
    );
    expect(flagged).toEqual([true, false]);
  });

  it("does not match when the note text differs", () => {
    const existing = new Set([noteKey("Alice D", "Decimals. All good.")]);
    expect(existing.has(noteKey("Alice D", "Fractions. All good."))).toBe(false);
  });
});

describe("what actually gets added", () => {
  const doc = asDocument([
    "Alice D",
    "Decimals",
    "All good. JD",
    "",
    "Bob T",
    "Fractions",
    "Fine. AB",
    "",
    "Charlie S",
    "Times tables",
    "Quick today. E Lov",
  ]);
  const parsed = parseBulkDocument(doc);
  const alreadyThere = new Set([noteKey("Alice D", "Decimals. All good.")]);

  it("leaves a note already added today out of the batch", () => {
    const cards = toCards(parsed.students, alreadyThere);
    expect(cards.map((card) => card.alreadyAdded)).toEqual([true, false, false]);
    expect(batchCount(cards)).toBe(2);
  });

  it("puts it back when a person asks for it anyway", () => {
    const cards = toCards(parsed.students, alreadyThere).map((card, index) =>
      index === 0 ? { ...card, includeAnyway: true } : card,
    );
    expect(batchCount(cards)).toBe(3);
    expect(inBatch(cards[0]!)).toBe(true);
  });

  it("takes a skipped one out, whatever else is true of it", () => {
    const cards = toCards(parsed.students, alreadyThere).map((card, index) =>
      index === 1 ? { ...card, skipped: true } : card,
    );
    expect(batchCount(cards)).toBe(1);
    expect(inBatch(cards[1]!)).toBe(false);
  });

  it("keeps a skipped one out even when it was asked for anyway", () => {
    const cards = toCards(parsed.students, alreadyThere).map((card, index) =>
      index === 0 ? { ...card, includeAnyway: true, skipped: true } : card,
    );
    expect(batchCount(cards)).toBe(2);
  });

  it("counts exactly what the batch holds", () => {
    const cards = toCards(parsed.students, alreadyThere);
    expect(batchCount(cards)).toBe(cards.filter(inBatch).length);
  });

  it("gives every card a key of its own", () => {
    const cards = toCards(parsed.students, new Set());
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length);
  });

  it("carries no student id until a person picks one", () => {
    expect(toCards(parsed.students, new Set()).every((card) => card.studentId === null)).toBe(true);
  });
});

describe("the panel and the way in", () => {
  const read = (path: string) =>
    require("node:fs").readFileSync(new URL(path, import.meta.url).pathname, "utf8") as string;
  const panel = read("../components/BulkUploadPanel.tsx");
  const today = read("../components/TodayScreen.tsx");

  it("only ever adds rows, and never changes or removes one", () => {
    expect(panel).toContain(".insert(");
    for (const forbidden of [".update(", ".delete(", ".upsert("]) {
      expect(panel).not.toContain(forbidden);
    }
  });

  it("saves a row shaped exactly like a typed note", () => {
    for (const field of [
      "note_date: sydneyTodayIso()",
      "collated: false",
      "draft_created: false",
      "no_match: false",
    ]) {
      expect(panel).toContain(field);
      expect(today).toContain(field);
    }
  });

  it("stamps every one of them as a bulk upload", () => {
    expect(panel).toContain('const ADDED_BY = "Bulk upload"');
    expect(panel).toContain("added_by: ADDED_BY");
  });

  it("opens the shared picker with no row to write to", () => {
    expect(panel).toContain("<MatchStudentPanel");
    expect(panel).toContain("noteId={null}");
  });

  it("offers the file picker for Word documents only", () => {
    expect(today).toContain('accept=".docx');
    expect(today).toContain('.endsWith(".docx")');
  });

  it("reads the document in the browser and sends it nowhere", () => {
    expect(today).toContain("mammoth/mammoth.browser.js");
    expect(today).toContain("file.arrayBuffer()");
    expect(today).not.toContain("FormData");
  });
});

describe("nothing here writes anything", () => {
  it("exports no function that could reach the database", () => {
    const source = require("node:fs").readFileSync(
      new URL("./bulkNotes.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    for (const forbidden of [
      "supabase",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "fetch(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
