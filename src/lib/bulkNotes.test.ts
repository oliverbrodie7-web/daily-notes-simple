import { describe, expect, it } from "bun:test";
import {
  NO_ANCHORS,
  ROSTER_MISSING,
  batchCount,
  buildStudent,
  cellLines,
  couldBeName,
  decodeEntities,
  duplicateWarning,
  duplicateWarnings,
  flattenDocument,
  htmlToText,
  inBatch,
  isAnchor,
  isIgnorable,
  looksLikeNameLine,
  noteBody,
  noteKey,
  noteTextFrom,
  parseBulkDocument,
  pickTopic,
  readDocument,
  squash,
  strippedInitials,
  toCards,
  stripTutorInitials,
  topicToWords,
} from "./bulkNotes";
import { matchNote } from "./touchPoints";

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

// The roster the reader anchors on. Everything the fixtures name is here,
// plus four Sams to make a line ambiguous and one name too long to be read
// as a name at all.
const ROSTER = [
  { id: 1, student_name: "Alice Dominguez" },
  { id: 2, student_name: "Bob Turner" },
  { id: 3, student_name: "Charlie Smith" },
  { id: 4, student_name: "Abi Wainwright" },
  { id: 5, student_name: "Alysha Adeyemi" },
  { id: 11, student_name: "Austin Dowling" },
  { id: 12, student_name: "Imogen Patel" },
  { id: 13, student_name: "Sydney Grant" },
  { id: 14, student_name: "Audrey Hall" },
  { id: 6, student_name: "Sam Ashford" },
  { id: 7, student_name: "Sam Bradley" },
  { id: 8, student_name: "Sam Curtis" },
  { id: 9, student_name: "Sam Delaney" },
  { id: 10, student_name: "Maximilian Rothschild Weatherby Fitzwilliam" },
];

const read = (html: string) => parseBulkDocument(html, ROSTER);

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

// The two real examples, exactly as they were given.
const REAL_ABI = [
  "Abi W",
  "4",
  "Statistics > Measures of Centre & Spread",
  "Revision. Distracted this lesson, however she did work through her questions at a fair pace. CC",
];
const REAL_ALYSHA = [
  "Alysha A",
  "Multiply > Algorithm",
  "Revision. Understands how to do one digit multiplication algorithms but has trouble with two digit and the carrying. lh",
];

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

describe("flattening", () => {
  it("a document with a table and loose paragraphs reads both", () => {
    const html = `${asDocument(["Alice D", "Decimals", "All good. JD"])}${asTable([
      ["Bob T", "Fractions", "Fine. AB"],
    ])}`;
    const result = read(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students.map((student) => student.name)).toEqual(["Bob T", "Alice D"]);
    expect(result.unrecognised).toEqual([]);
  });

  it("puts every cell's lines in before the loose ones, and drops the blanks", () => {
    const html = `<p>Loose</p>${asTable([["A", "B"], [], ["C"]])}<p></p><p>After</p>`;
    expect(flattenDocument(readDocument(html))).toEqual(["A", "B", "C", "Loose", "After"]);
  });

  it("keeps nothing that was only whitespace", () => {
    expect(flattenDocument(readDocument(asDocument(["", "  ", "One"])))).toEqual(["One"]);
  });
});

describe("what anchors a new entry", () => {
  it("a line naming somebody on the roster anchors", () => {
    expect(isAnchor("Alice D", ROSTER)).toBe(true);
    expect(isAnchor("Bob T", ROSTER)).toBe(true);
  });

  it("a line matching four students still anchors a new entry", () => {
    expect(matchNote({ student_name: "Sam" }, ROSTER).kind).toBe("ambiguous");
    expect(isAnchor("Sam", ROSTER)).toBe(true);
  });

  it("a long line that matches a student name does not anchor", () => {
    const long = "Maximilian Rothschild Weatherby Fitzwilliam";
    expect(long.length).toBeGreaterThan(40);
    // The matcher would take it. The length guard is what stops it.
    expect(matchNote({ student_name: long }, ROSTER).kind).toBe("matched");
    expect(isAnchor(long, ROSTER)).toBe(false);
  });

  it("a line ending in a full stop does not anchor", () => {
    // The matcher takes "Alice D." because its initial pattern allows the
    // stop. The sentence guard is what stops it.
    expect(matchNote({ student_name: "Alice D." }, ROSTER).kind).toBe("matched");
    expect(isAnchor("Alice D.", ROSTER)).toBe(false);
    expect(couldBeName("Worked hard today!")).toBe(false);
    expect(couldBeName("Did she finish?")).toBe(false);
  });

  it("a line naming nobody does not anchor", () => {
    expect(isAnchor("Decimals", ROSTER)).toBe(false);
    expect(isAnchor("Zebedee Q", ROSTER)).toBe(false);
  });
});

describe("inside one entry", () => {
  it("a student with three lines is read", () => {
    const result = read(asDocument(["Alice D", "Decimals", "All good. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      name: "Alice D",
      topic: "Decimals",
      note: "All good. JD",
      noteText: "Decimals. All good.",
      ignored: [],
    });
  });

  it("a student with four lines including a bare number is read, and the number is ignored", () => {
    const result = read(asDocument(REAL_ABI));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const student = result.students[0];
    expect(student?.name).toBe("Abi W");
    expect(student?.ignored).toEqual(["4"]);
    expect(student?.topic).toBe("Statistics > Measures of Centre & Spread");
    expect(student?.noteText).toBe(
      "Statistics, Measures of Centre & Spread. Revision. Distracted this lesson, however she did work through her questions at a fair pace.",
    );
  });

  it("two students with different line counts are both read", () => {
    const result = read(asDocument([...REAL_ABI, "", ...REAL_ALYSHA]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students.map((student) => student.name)).toEqual(["Abi W", "Alysha A"]);
    expect(result.students[0]?.ignored).toEqual(["4"]);
    expect(result.students[1]?.ignored).toEqual([]);
    expect(result.students[1]?.topic).toBe("Multiply > Algorithm");
  });

  it("reads them with no blank line between at all", () => {
    const result = read(asDocument([...REAL_ABI, ...REAL_ALYSHA]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(2);
  });

  it("reads them with several blank lines between", () => {
    const result = read(asDocument([...REAL_ABI, "", "", "", ...REAL_ALYSHA]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(2);
  });

  it("gathers every extra line into the note", () => {
    const result = read(
      asDocument([
        "Alice D",
        "Decimals",
        "Worked steadily.",
        "Finished early.",
        "Good session. JD",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.note).toBe("Worked steadily. Finished early. Good session. JD");
  });

  it("keeps a student with no note at all, with the note empty", () => {
    const result = read(asDocument(["Alice D", "", "Bob T", "Decimals", "Fine. AB"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]).toMatchObject({ name: "Alice D", note: "", topic: "" });
    expect(result.students).toHaveLength(2);
  });

  it("records the line the name sat on", () => {
    const result = read(
      asDocument(["Alice D", "Decimals", "Fine.", "Bob T", "Fractions", "Fine."]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students.map((student) => student.at)).toEqual([1, 4]);
  });
});

describe("choosing the topic", () => {
  it("the first greater than line becomes the topic when it is not the last line", () => {
    expect(pickTopic(["Multiply > Algorithm", "Worked well. JD"])).toBe(0);
    expect(pickTopic(["A note first.", "Multiply > Algorithm", "Then this."])).toBe(1);
  });

  it("a note containing a greater than sign is not treated as the topic", () => {
    const result = read(asDocument(["Alice D", "Decimals", "She saw that 12 > 8. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.topic).toBe("Decimals");
    expect(result.students[0]?.note).toBe("She saw that 12 > 8. JD");
  });

  it("never takes the last remaining line, even when it is the only one with a sign", () => {
    expect(pickTopic(["Worked hard.", "She saw that 12 > 8"])).toBe(-1);
    expect(pickTopic(["She saw that 12 > 8"])).toBe(-1);
  });

  it("falls back to a short opening line with no full stop", () => {
    expect(pickTopic(["Decimals", "All good."])).toBe(0);
  });

  it("takes no topic when the opening line reads as a sentence", () => {
    expect(pickTopic(["She worked steadily. JD", "And finished."])).toBe(-1);
  });

  it("takes no topic when the opening line is too long to be one", () => {
    const long = "x".repeat(61);
    expect(pickTopic([long, "All good."])).toBe(-1);
  });

  it("the topic still has its greater than signs turned into commas", () => {
    const result = read(asDocument(["Charlie S", "Fractions > Adding > Unlike", "Fine. AB"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.noteText).toBe("Fractions, Adding, Unlike. Fine.");
  });
});

describe("lines that anchor on nobody", () => {
  it("lines before the first student name become an unrecognised block", () => {
    const result = read(asDocument(["Week 5 notes", "Tuesday", "Alice D", "Decimals", "Fine. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unrecognised).toEqual([{ lines: ["Week 5 notes", "Tuesday"], at: 1 }]);
    expect(result.students).toHaveLength(1);
  });

  it("says nothing when the document opens on a name", () => {
    const result = read(THREE_STUDENTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unrecognised).toEqual([]);
  });

  it("an unrecognised block is excluded from the batch count until a student is picked", () => {
    const result = read(asDocument(["Loose line", "Alice D", "Decimals", "Fine. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = toCards(result.students, result.unrecognised, new Set());
    expect(cards).toHaveLength(2);
    const block = cards.find((card) => card.unrecognised);
    expect(block).toBeDefined();
    expect(inBatch(block!)).toBe(false);
    expect(batchCount(cards)).toBe(1);
    const picked = cards.map((card) => (card.unrecognised ? { ...card, studentId: "3" } : card));
    expect(batchCount(picked)).toBe(2);
  });

  it("shows the block where it was written, before the students", () => {
    const result = read(asDocument(["Loose line", "Alice D", "Decimals", "Fine. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = toCards(result.students, result.unrecognised, new Set());
    expect(cards[0]?.unrecognised).toBe(true);
    expect(cards[0]?.student.note).toBe("Loose line");
    expect(cards[1]?.student.name).toBe("Alice D");
  });
});

describe("what it still refuses", () => {
  it("an empty roster refuses rather than reading", () => {
    const result = parseBulkDocument(THREE_STUDENTS, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(ROSTER_MISSING);
    expect(result.students).toEqual([]);
  });

  it("a document with no student names refuses", () => {
    const result = read(asDocument(["Decimals", "All good today.", "Fractions"]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(NO_ANCHORS);
    expect(result.text).toBe("Decimals");
  });

  it("an empty document refuses", () => {
    const result = read(asDocument(["", "  ", ""]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("There is no text in this document.");
  });

  it("refusals carry no half read students", () => {
    for (const result of [parseBulkDocument(THREE_STUDENTS, []), read(asDocument(["Decimals"]))]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.students).toEqual([]);
    }
  });
});

describe("the numbers it throws away", () => {
  it("knows a bare number when it sees one", () => {
    expect(isIgnorable("4")).toBe(true);
    expect(isIgnorable(" 12 ")).toBe(true);
    expect(isIgnorable("Year 4")).toBe(false);
    expect(isIgnorable("4th")).toBe(false);
    expect(isIgnorable("")).toBe(false);
  });

  it("records every one rather than losing it", () => {
    const built = buildStudent("Alice D", ["4", "Decimals", "9", "All good. JD"], 1);
    expect(built.ignored).toEqual(["4", "9"]);
    expect(built.note).toBe("All good. JD");
  });
});

describe("what the card shows was left out", () => {
  it("tutor initials are still stripped from the note", () => {
    const result = read(asDocument(["Alice D", "Decimals", "Worked hard today. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.noteText).toBe("Decimals. Worked hard today.");
    expect(noteBody("Worked hard today. JD")).toBe("Worked hard today.");
  });

  it("says which initials went", () => {
    expect(strippedInitials("Worked hard today. JD")).toBe("JD");
    expect(strippedInitials("Worked hard today. E Lov")).toBe("E Lov");
    expect(strippedInitials("Worked hard today")).toBe("");
  });

  it("the note it shows is the note it saves, without the topic in front", () => {
    const built = buildStudent("Alice D", ["Decimals", "Worked hard today. JD"], 1);
    expect(noteBody(built.note)).toBe("Worked hard today.");
    expect(built.noteText).toBe(`${topicToWords(built.topic)}. ${noteBody(built.note)}`);
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

  it("leaves initials alone when a dash rather than a full stop precedes them", () => {
    // Changed with the full stop rule. A dash is not the end of a sentence,
    // and the full stop is the only thing that tells an initial from an
    // ordinary last word, so "Worked hard today - JD" keeps its JD. The
    // alternative was losing the "did" from "she knows what she did".
    expect(stripTutorInitials("Worked hard today - JD")).toBe("Worked hard today - JD");
  });
});

describe("score lines", () => {
  it("a line reading 87 percent is ignored and recorded", () => {
    expect(isIgnorable("87%")).toBe(true);
    const result = read(
      asDocument([
        "Austin D",
        "Add > Add Strategy Mixed",
        "87%",
        "Master. Austin is very strong at his partitioning method for addition.",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.ignored).toEqual(["87%"]);
    expect(result.students[0]?.note).toBe(
      "Master. Austin is very strong at his partitioning method for addition.",
    );
    expect(result.students[0]?.note.startsWith("87%")).toBe(false);
  });

  it("a line reading 100 percent with a space before the sign is ignored", () => {
    expect(isIgnorable("100%")).toBe(true);
    expect(isIgnorable("70 %")).toBe(true);
    expect(isIgnorable("100 %")).toBe(true);
  });

  it("two score lines in one entry are both ignored", () => {
    const built = buildStudent(
      "Austin D",
      ["50%", "100%", "Topic Test. good overall understanding. CC"],
      1,
    );
    expect(built.ignored).toEqual(["50%", "100%"]);
    expect(built.note).toBe("Topic Test. good overall understanding. CC");
  });

  it("a line reading 87% Master is not ignored", () => {
    expect(isIgnorable("87% Master")).toBe(false);
    expect(isIgnorable("Scored 87%")).toBe(false);
  });

  it("a line reading Percentages is not ignored", () => {
    expect(isIgnorable("Percentages")).toBe(false);
    expect(isIgnorable("%")).toBe(false);
    expect(isIgnorable("87.5 out of 100")).toBe(false);
  });

  it("a score line with a decimal is ignored", () => {
    // Changed by request. This used to assert the opposite, because the
    // number had to be whole.
    expect(isIgnorable("87.5%")).toBe(true);
    expect(isIgnorable("87.5 %")).toBe(true);
    expect(isIgnorable("87.5")).toBe(true);
    // A decimal point with nothing after it is not a number.
    expect(isIgnorable("87.")).toBe(false);
    expect(isIgnorable(".5")).toBe(false);
  });

  it("a bare number is still ignored", () => {
    expect(isIgnorable("4")).toBe(true);
  });
});

describe("a name the roster does not know", () => {
  it("a capitalised two word line after a full stop anchors even when the roster does not know it", () => {
    expect(matchNote({ student_name: "Jade BM" }, ROSTER).kind).toBe("unmatched");
    expect(looksLikeNameLine("Jade BM", "Congruent Figures. she picked up on them well.")).toBe(
      true,
    );
    const result = read(
      asDocument([
        "Imogen P",
        "Geometry / Space > Shape",
        "Congruent Figures. she picked up on them well and should be set up well.",
        "Jade BM",
        "Linear Relationships > Linear Graphs",
        "Linear Plot. Can read the x and y axis to plot points.",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two entries, with no blank line between them anywhere in the source.
    expect(result.students).toHaveLength(2);
    expect(result.students.map((student) => student.name)).toEqual(["Imogen P", "Jade BM"]);
    expect(result.students[0]?.note).not.toContain("Linear Plot");
  });

  it("an entry anchored without a match is shown as needing a student", () => {
    const result = read(
      asDocument(["Alice D", "Decimals", "All good. JD", "Riley RP", "Fractions", "Fine. AB"]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students.map((student) => student.unmatched)).toEqual([false, true]);
    expect(matchNote({ student_name: "Riley RP" }, ROSTER).kind).toBe("unmatched");
  });

  it("an entry anchored without a match is excluded from the batch count", () => {
    const result = read(
      asDocument(["Alice D", "Decimals", "All good. JD", "Sage PL", "Fractions", "Fine. AB"]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = toCards(result.students, result.unrecognised, new Set());
    expect(cards).toHaveLength(2);
    expect(batchCount(cards)).toBe(1);
    expect(inBatch(cards[1]!)).toBe(false);
    const picked = cards.map((card) =>
      card.student.unmatched ? { ...card, studentId: "1" } : card,
    );
    expect(batchCount(picked)).toBe(2);
  });

  it("a name after a note that signs off with initials still anchors", () => {
    // Every real note ends with initials, so the line before a name almost
    // never ends with a full stop. Without this the rule would hardly ever
    // fire on the documents it was written for.
    expect(looksLikeNameLine("Jade BM", "did work through her questions at a fair pace. CC")).toBe(
      true,
    );
    expect(looksLikeNameLine("Jade BM", "writing down the correct value.lh")).toBe(true);
  });

  it("a name anchors when the previous note has no full stop and the entry already has three body lines", () => {
    const result = read(
      asDocument([
        "Sydney G",
        "Integers > Integers +",
        "70%",
        "Asteroid - Add. Negative numbers are a relatively new idea for her, and when we subtract, we go to the left on the number line",
        "Zoe BM",
        "Linear Relationships > Linear Graphs",
        "Linear Plot. Should revise plotting points from an equation.",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(2);
    expect(result.students.map((student) => student.name)).toEqual(["Sydney G", "Zoe BM"]);
    // Sydney is on the roster, Zoe is not. Zoe is the one the route exists
    // for: nothing else in the source hints at a boundary, and the line
    // before her ends mid sentence with no full stop at all.
    expect(result.students[0]?.unmatched).toBe(false);
    expect(result.students[1]?.unmatched).toBe(true);
    expect(result.students[0]?.note).not.toContain("Linear Plot");
    expect(result.students[0]?.note).not.toContain("Zoe");
    expect(result.students[0]?.ignored).toEqual(["70%"]);
    // Excluded from the batch until somebody says who she is.
    const cards = toCards(result.students, result.unrecognised, new Set());
    expect(batchCount(cards)).toBe(1);
  });

  it("the position alone is enough, whatever the previous line ends with", () => {
    const unfinished = "we go to the left on the number line";
    expect(looksLikeNameLine("Zoe BM", unfinished, 0)).toBe(false);
    expect(looksLikeNameLine("Zoe BM", unfinished, 1)).toBe(false);
    expect(looksLikeNameLine("Zoe BM", unfinished, 2)).toBe(true);
    expect(looksLikeNameLine("Zoe BM", unfinished, 3)).toBe(true);
  });

  it("a topic line directly under a name still does not anchor", () => {
    const result = read(
      asDocument([
        "Audrey H",
        "Number Facts",
        "Demolition. Overall Audrey is amazing at her algorithms.",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two capitalised words with no full stop, and it stays the topic,
    // because a topic always sits at body position zero.
    expect(result.students).toHaveLength(1);
    expect(result.students[0]?.name).toBe("Audrey H");
    expect(result.students[0]?.topic).toBe("Number Facts");
    expect(looksLikeNameLine("Number Facts", "Audrey H", 0)).toBe(false);
  });

  it("a score line does not push a topic line into anchoring", () => {
    // The topic is at position zero and a score at position one, so the
    // line after a score is still only at position two when it is a real
    // name. A second topic line cannot reach that far.
    const result = read(
      asDocument([
        "Austin D",
        "Add > Add Strategy Mixed",
        "87%",
        "Master. Austin is very strong at his partitioning method.",
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(1);
  });

  it("a capitalised line in the middle of a sentence does not anchor", () => {
    // The previous line has not finished, so this belongs to the note.
    expect(looksLikeNameLine("Congruent Figures", "Geometry / Space > Shape")).toBe(false);
    expect(looksLikeNameLine("Linear Plot", "Linear Relationships > Linear Graphs")).toBe(false);
  });

  it("a two word line that is not capitalised does not anchor", () => {
    expect(looksLikeNameLine("jade bm", "All good.")).toBe(false);
    expect(looksLikeNameLine("Jade bm", "All good.")).toBe(false);
  });

  it("refuses the shapes that are not names at all", () => {
    expect(looksLikeNameLine("Jade", "All good.")).toBe(false);
    expect(looksLikeNameLine("One Two Three Four", "All good.")).toBe(false);
    expect(looksLikeNameLine("Add > Add Strategy", "All good.")).toBe(false);
    expect(looksLikeNameLine("Year 7 Maths", "All good.")).toBe(false);
    expect(looksLikeNameLine("Top 50 %", "All good.")).toBe(false);
    expect(looksLikeNameLine("Jade BM.", "All good.")).toBe(false);
  });

  it("anchors on the very first line, which has nothing before it", () => {
    expect(looksLikeNameLine("Jade BM", null)).toBe(true);
    const result = read(asDocument(["Jade BM", "Fractions", "Fine. AB"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.name).toBe("Jade BM");
    expect(result.unrecognised).toEqual([]);
  });

  it("a name the roster knows still anchors the way it always did", () => {
    const result = read(THREE_STUDENTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students).toHaveLength(3);
    expect(result.students.every((student) => student.unmatched === false)).toBe(true);
  });

  it("an ambiguous name still anchors, and is not marked unmatched", () => {
    const result = read(asDocument(["Sam", "Fractions", "Fine. AB"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.unmatched).toBe(false);
    expect(inBatch(toCards(result.students, [], new Set())[0]!)).toBe(true);
  });
});

describe("initials after a full stop", () => {
  it("initials directly after a full stop with no space are stripped", () => {
    expect(stripTutorInitials("writing down the correct value.lh")).toBe(
      "writing down the correct value.",
    );
  });

  it("lowercase initials after a full stop and a space are stripped", () => {
    expect(stripTutorInitials("Revision. Understands the carrying. lh")).toBe(
      "Revision. Understands the carrying.",
    );
    expect(stripTutorInitials("at a fair pace. CC")).toBe("at a fair pace.");
    expect(stripTutorInitials("did really well. E Lov")).toBe("did really well.");
  });

  it("a final word that is not preceded by a full stop is kept", () => {
    expect(stripTutorInitials("she knows what she did")).toBe("she knows what she did");
    expect(stripTutorInitials("answer these question essay")).toBe("answer these question essay");
    expect(stripTutorInitials("beating the average of the top class!!")).toBe(
      "beating the average of the top class!!",
    );
  });

  it("the real example loses its CC and keeps everything else", () => {
    const result = read(asDocument(REAL_ABI));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.noteText.endsWith("at a fair pace.")).toBe(true);
    expect(strippedInitials(result.students[0]?.note ?? "")).toBe("CC");
  });

  it("the second real example now loses its lh as well", () => {
    const result = read(asDocument(REAL_ALYSHA));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]?.noteText.endsWith("the carrying.")).toBe(true);
    expect(strippedInitials(result.students[0]?.note ?? "")).toBe("lh");
  });
});

describe("a block keeps its shape", () => {
  it("an unrecognised block keeps its line breaks in the preview", () => {
    const result = read(asDocument(["Week 5 notes", "Tuesday", "Alice D", "Decimals", "Fine. JD"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = toCards(result.students, result.unrecognised, new Set());
    const block = cards.find((card) => card.unrecognised);
    expect(block?.blockLines).toEqual(["Week 5 notes", "Tuesday"]);
    // The joined form is still there for anything wanting one string.
    expect(block?.student.note).toBe("Week 5 notes Tuesday");
    expect(
      cards.filter((card) => !card.unrecognised).every((card) => card.blockLines.length === 0),
    ).toBe(true);
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
    const result = read(doc);
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
    const result = read(doc);
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
  const parsed = read(doc);
  const students = parsed.ok ? parsed.students : [];
  const alreadyThere = new Set([noteKey("Alice D", "Decimals. All good.")]);

  it("leaves a note already added today out of the batch", () => {
    const cards = toCards(students, [], alreadyThere);
    expect(cards.map((card) => card.alreadyAdded)).toEqual([true, false, false]);
    expect(batchCount(cards)).toBe(2);
  });

  it("puts it back when a person asks for it anyway", () => {
    const cards = toCards(students, [], alreadyThere).map((card, index) =>
      index === 0 ? { ...card, includeAnyway: true } : card,
    );
    expect(batchCount(cards)).toBe(3);
    expect(inBatch(cards[0]!)).toBe(true);
  });

  it("takes a skipped one out, whatever else is true of it", () => {
    const cards = toCards(students, [], alreadyThere).map((card, index) =>
      index === 1 ? { ...card, skipped: true } : card,
    );
    expect(batchCount(cards)).toBe(1);
    expect(inBatch(cards[1]!)).toBe(false);
  });

  it("keeps a skipped one out even when it was asked for anyway", () => {
    const cards = toCards(students, [], alreadyThere).map((card, index) =>
      index === 0 ? { ...card, includeAnyway: true, skipped: true } : card,
    );
    expect(batchCount(cards)).toBe(2);
  });

  it("counts exactly what the batch holds", () => {
    const cards = toCards(students, [], alreadyThere);
    expect(batchCount(cards)).toBe(cards.filter(inBatch).length);
  });

  it("gives every card a key of its own", () => {
    const cards = toCards(students, [], new Set());
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length);
  });

  it("carries no student id until a person picks one", () => {
    expect(toCards(students, [], new Set()).every((card) => card.studentId === null)).toBe(true);
  });
});

describe("the panel and the way in", () => {
  const read = (path: string) =>
    require("node:fs").readFileSync(new URL(path, import.meta.url).pathname, "utf8") as string;
  const panel = read("../components/BulkUploadPanel.tsx");
  const today = read("../components/TodayScreen.tsx");
  // The typed note's row moved out of the screen and into the module that
  // decides whether to ask before saving.
  const typedRow = read("../lib/noteSave.ts");

  it("only ever adds rows, and never changes or removes one", () => {
    expect(panel).toContain(".insert(");
    for (const forbidden of [".update(", ".delete(", ".upsert("]) {
      expect(panel).not.toContain(forbidden);
    }
  });

  it("saves a row shaped exactly like a typed note", () => {
    // The claim is unchanged: a bulk row carries the same flags a typed
    // one does. Only where the typed one is built has moved.
    for (const field of ["collated: false", "draft_created: false", "no_match: false"]) {
      expect(panel).toContain(field);
      expect(typedRow).toContain(field);
    }
    expect(panel).toContain("note_date: sydneyTodayIso()");
    expect(typedRow).toContain("note_date: noteDate");
    // And the screen is what reads the clock, at the moment of saving.
    expect(today).toContain("noteDate: sydneyTodayIso()");
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
