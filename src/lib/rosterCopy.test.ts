import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import {
  COPY_DEFAULT,
  COPY_FAILED_LABEL,
  COPY_IDLE,
  COPY_IDLE_LABEL,
  COPY_OPTIONS,
  copyLabel,
  COPY_MENU_TITLE,
  copyRows,
  runCopy,
  type CopyStudent,
} from "./rosterCopy";
import { applyFilter } from "./rosterFilters";
import { sortRoster } from "./rosterSort";

function student(over: Partial<CopyStudent> & { student_name: string }): CopyStudent {
  return {
    parent_name: `${over.student_name.split(" ")[0]} parent`,
    parent_email: `${over.student_name.split(" ")[0]?.toLowerCase()}@example.com`,
    parent_phone: "0412 345 678",
    ...over,
  };
}

const AVA = student({ student_name: "Ava Donnelly" });
const JADE = student({ student_name: "Jade Bransby-McKenna" });
const SITHUNI = student({ student_name: "Sithuni De Silva" });

describe("the four formats", () => {
  test("the names format is one line, comma separated", () => {
    const result = copyRows([AVA, JADE, SITHUNI], "names");
    expect(result.text).toBe("Ava Donnelly, Jade Bransby-McKenna, Sithuni De Silva");
    expect(result.text.includes("\n")).toBe(false);
    expect(result.count).toBe(3);
  });

  test("names and parents puts one student per line", () => {
    const result = copyRows([AVA, JADE], "parents");
    expect(result.text).toBe("Ava Donnelly, Ava parent\nJade Bransby-McKenna, Jade parent");
    expect(result.text.split("\n")).toHaveLength(2);
  });

  test("names and phones puts one student per line", () => {
    const result = copyRows([AVA, JADE], "phones");
    expect(result.text).toBe(
      "Ava Donnelly, Ava parent, 0412 345 678\nJade Bransby-McKenna, Jade parent, 0412 345 678",
    );
    expect(result.text.split("\n")).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  test("parent emails are one line, for a BCC field", () => {
    const result = copyRows([AVA, JADE], "emails");
    expect(result.text).toBe("Ava parent <ava@example.com>, Jade parent <jade@example.com>");
    expect(result.text.includes("\n")).toBe(false);
  });

  test("every value is trimmed", () => {
    const messy = student({
      student_name: "  Ava Donnelly  ",
      parent_name: " Mrs Donnelly ",
      parent_phone: "  0412 345 678 ",
      parent_email: "  ava@example.com  ",
    });
    expect(copyRows([messy], "names").text).toBe("Ava Donnelly");
    expect(copyRows([messy], "phones").text).toBe("Ava Donnelly, Mrs Donnelly, 0412 345 678");
    expect(copyRows([messy], "emails").text).toBe("Mrs Donnelly <ava@example.com>");
  });

  test("the order matches what is rendered", () => {
    // Whatever order the array arrives in is the order that comes out. The
    // sort upstream is the only thing that decides it.
    const rows = [SITHUNI, AVA, JADE];
    expect(copyRows(rows, "names").text).toBe(
      "Sithuni De Silva, Ava Donnelly, Jade Bransby-McKenna",
    );
    const reversed = [...rows].reverse();
    expect(copyRows(reversed, "names").text).toBe(
      "Jade Bransby-McKenna, Ava Donnelly, Sithuni De Silva",
    );
  });
});

describe("what is left out", () => {
  test("a student with no parent email is skipped from the email format", () => {
    const none = student({ student_name: "Bo Ng", parent_email: null });
    const blank = student({ student_name: "Kit Ash", parent_email: "   " });
    const result = copyRows([AVA, none, blank, JADE], "emails");
    expect(result.text).toBe("Ava parent <ava@example.com>, Jade parent <jade@example.com>");
    expect(result.count).toBe(2);
  });

  test("parent emails are deduplicated across siblings", () => {
    const one = student({ student_name: "Ruby Ashford", parent_email: "ashford@example.com" });
    const two = student({ student_name: "Tom Ashford", parent_email: "ashford@example.com" });
    // Written both ways in the records, which is still one address.
    const three = student({ student_name: "Mia Ashford", parent_email: " Ashford@Example.com " });
    const result = copyRows([one, two, three, AVA], "emails");
    expect(result.text).toBe("Ruby parent <ashford@example.com>, Ava parent <ava@example.com>");
    expect(result.count).toBe(2);
  });

  test("the count in the label is what was copied, not what was shown", () => {
    const shown = [AVA, student({ student_name: "Bo Ng", parent_email: null }), JADE];
    expect(shown).toHaveLength(3);
    const result = copyRows(shown, "emails");
    expect(result.count).toBe(2);
    expect(copyLabel({ kind: "copied", count: result.count })).toBe("2 copied");
  });

  test("a missing name drops the student from every format that prints one", () => {
    const nameless = student({ student_name: "" });
    expect(copyRows([nameless, AVA], "names").count).toBe(1);
    expect(copyRows([nameless, AVA], "parents").count).toBe(1);
    expect(copyRows([nameless, AVA], "phones").count).toBe(1);
  });

  test("no student prints an empty slot", () => {
    const partial = student({ student_name: "Bo Ng", parent_name: null, parent_phone: null });
    for (const option of COPY_OPTIONS) {
      const text = copyRows([partial], option.key).text;
      expect(text).not.toContain(", ,");
      expect(text.endsWith(",")).toBe(false);
    }
  });

  test("a student with a phone but no parent name is still printed with the number", () => {
    // On a call sheet the number is the point. Six parents on the roster
    // carry a first name only, so requiring a parent name here would throw
    // away usable numbers.
    const noParent = student({
      student_name: "Ava Donnelly",
      parent_name: null,
      parent_phone: "0412 345 678",
    });
    const both = student({
      student_name: "Ava Donnelly",
      parent_name: "Nicole Donnelly",
      parent_phone: "0421 891 991",
    });
    expect(copyRows([both], "phones").text).toBe("Ava Donnelly, Nicole Donnelly, 0421 891 991");
    expect(copyRows([noParent], "phones").text).toBe("Ava Donnelly, 0412 345 678");
    expect(copyRows([noParent], "phones").count).toBe(1);
  });

  test("a student with no phone is still skipped from the phone format", () => {
    const noPhone = student({ student_name: "Bo Ng", parent_phone: null });
    const blankPhone = student({ student_name: "Kit Ash", parent_phone: "   " });
    const keeper = student({ student_name: "Ava Donnelly", parent_phone: "0412 345 678" });
    const result = copyRows([noPhone, blankPhone, keeper], "phones");
    expect(result.count).toBe(1);
    expect(result.text).toBe("Ava Donnelly, Ava parent, 0412 345 678");
    // And a student with no name is still skipped, phone or not.
    expect(
      copyRows([student({ student_name: "", parent_phone: "0400 000 000" })], "phones").count,
    ).toBe(0);
  });

  test("a blank parent name does not print an empty slot or a stray comma", () => {
    for (const parent of [null, "", "   "]) {
      const line = copyRows(
        [
          student({
            student_name: "Ava Donnelly",
            parent_name: parent,
            parent_phone: "0412 345 678",
          }),
        ],
        "phones",
      ).text;
      expect(line).toBe("Ava Donnelly, 0412 345 678");
      expect(line).not.toContain(", ,");
      expect(line).not.toContain(",,");
      expect(line.endsWith(",")).toBe(false);
    }
  });

  test("the other three formats still skip a student with a missing value", () => {
    const noParent = student({ student_name: "Ava Donnelly", parent_name: null });
    const noEmail = student({ student_name: "Ava Donnelly", parent_email: null });
    const noName = student({ student_name: "" });
    expect(copyRows([noParent], "parents").count).toBe(0);
    expect(copyRows([noEmail], "emails").count).toBe(0);
    expect(copyRows([noName], "names").count).toBe(0);
    // The relaxation is for phones alone.
    expect(copyRows([noParent], "phones").count).toBe(1);
  });

  test("an empty list copies an empty string and counts none", () => {
    expect(copyRows([], "names")).toEqual({ text: "", count: 0 });
  });
});

describe("what is on screen is what is copied", () => {
  type Row = {
    student: CopyStudent;
    done: boolean;
    overdue: boolean;
    focus: boolean;
    touchPoints: number;
    goneQuiet: boolean;
    status: string;
    lastContacted: string | null;
    engagement: number;
  };

  function row(name: string, over: Partial<Row> = {}): Row {
    return {
      student: student({ student_name: name }),
      done: false,
      overdue: false,
      focus: false,
      touchPoints: 1,
      goneQuiet: false,
      status: "none",
      lastContacted: null,
      engagement: 0,
      ...over,
    };
  }

  const ROSTER = [
    row("Ava Donnelly", { done: true }),
    row("Jade Bransby-McKenna"),
    row("Sithuni De Silva"),
  ];

  test("copying respects an active tile filter rather than the whole roster", () => {
    const all = copyRows(
      ROSTER.map((r) => r.student),
      "names",
    );
    expect(all.count).toBe(3);
    // The button is handed applyFilter's output, the same array the views
    // render.
    const done = applyFilter("complete", ROSTER).map((r) => r.student);
    const copied = copyRows(done, "names");
    expect(copied.count).toBe(1);
    expect(copied.text).toBe("Ava Donnelly");
  });

  test("copying respects the search box", () => {
    const query = "sithuni";
    const found = ROSTER.filter((r) =>
      (r.student.student_name ?? "").toLowerCase().includes(query),
    ).map((r) => r.student);
    const copied = copyRows(found, "names");
    expect(copied.count).toBe(1);
    expect(copied.text).toBe("Sithuni De Silva");
  });

  test("copying follows the sort, so the order is the order shown", () => {
    const sorted = sortRoster(
      ROSTER.map((r) => ({
        ...r,
        student: { ...r.student, student_name: r.student.student_name },
      })),
      "name",
      "reversed",
    );
    const shownOrder = sorted.map((r) => r.student.student_name);
    expect(
      copyRows(
        sorted.map((r) => r.student),
        "names",
      ).text,
    ).toBe(shownOrder.join(", "));
  });

  test("the screen hands it the array the views render from", () => {
    const source = readFileSync(
      new URL("../components/TrackerScreen.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("<RosterCopyButton students={filtered.map((row) => row.student)} />");
    // filtered is what the table maps and what the board is given.
    expect(source).toContain("{filtered.map(");
    expect(source).toContain("rows={filtered}");
  });
});

describe("the click", () => {
  test("the left side copies names without opening the menu", async () => {
    expect(COPY_DEFAULT).toBe("names");
    const copy = mock(async () => true);
    const state = await runCopy({ copy }, [AVA, JADE], COPY_DEFAULT);
    expect(copy.mock.calls[0]?.[0]).toBe("Ava Donnelly, Jade Bransby-McKenna");
    expect(state).toEqual({ kind: "copied", count: 2 });
    // The left half calls it directly, with no menu in between.
    const source = readFileSync(
      new URL("../components/RosterCopyButton.tsx", import.meta.url),
      "utf8",
    );
    const main = source.slice(source.indexOf('className="row-log-main"'));
    expect(main.slice(0, 260)).toContain("handleCopy(COPY_DEFAULT)");
    expect(main.slice(0, 260)).not.toContain("setOpen(true)");
  });

  test("a failed clipboard write shows a failure label and does not throw", async () => {
    const refused = await runCopy({ copy: async () => false }, [AVA], "names");
    expect(refused).toEqual({ kind: "failed" });
    expect(copyLabel(refused)).toBe(COPY_FAILED_LABEL);
    // A clipboard that refuses rejects rather than returning.
    const threw = await runCopy(
      {
        copy: async () => {
          throw new Error("NotAllowedError");
        },
      },
      [AVA],
      "names",
    );
    expect(threw).toEqual({ kind: "failed" });
    expect(copyLabel(threw)).toBe(COPY_FAILED_LABEL);
  });

  test("the label goes back to itself", () => {
    expect(copyLabel(COPY_IDLE)).toBe(COPY_IDLE_LABEL);
    expect(copyLabel({ kind: "copied", count: 76 })).toBe("76 copied");
  });

  test("the menu heading carries no number", () => {
    expect(COPY_MENU_TITLE).toBe("Copy the students on screen");
    expect(COPY_MENU_TITLE).not.toMatch(/\d/);
    // Only the button reports a number, and only after the click, when it
    // is the true one.
    expect(copyLabel({ kind: "copied", count: 75 })).toBe("75 copied");
  });

  test("the menu has the four formats, each with a description", () => {
    expect(COPY_OPTIONS.map((option) => option.label)).toEqual([
      "Names",
      "Names and parents",
      "Parent emails",
      "Names and phones",
    ]);
    for (const option of COPY_OPTIONS) expect(option.hint.length).toBeGreaterThan(0);
  });
});

describe("where it sits", () => {
  const source = readFileSync(new URL("../components/TrackerScreen.tsx", import.meta.url), "utf8");

  test("the button appears in all three views", () => {
    // The switcher row is above the branch that chooses a view, so it is
    // rendered once for Table, Cards and Board alike.
    const row = source.indexOf('<div className="roster-tools">');
    // The one after the row, not the SortMenu guard higher up the file.
    const branch = source.indexOf('showing === "board" ?', row);
    expect(row).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(row);
    const block = source.slice(row, branch);
    expect(block).toContain("<RosterCopyButton");
    // And it is not inside the wide only guard the switcher sits behind.
    // One guard in the row, and it is the switcher's.
    expect(block).toContain("{wide ? <RosterViewSwitcher");
    expect(block.split("wide ?").length - 1).toBe(1);
  });

  test("it sits at the right hand end, beside the count", () => {
    const start = source.indexOf('<div className="roster-tools">');
    const row = source.slice(start, source.indexOf('showing === "board" ?', start));
    const count = row.indexOf('className="roster-count"');
    const button = row.indexOf("<RosterCopyButton");
    expect(count).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(count);
    expect(row).toContain('className="roster-tools-right"');
  });

  test("it has its own open flag, so the row menus are untouched", () => {
    const button = readFileSync(
      new URL("../components/RosterCopyButton.tsx", import.meta.url),
      "utf8",
    );
    expect(button).toContain("const [open, setOpen] = useState(false)");
    expect(button).not.toContain("rowMenuId");
    expect(button).not.toContain("setMenuOpen");
    // Closes on an outside tap and on escape, like the menus beside it.
    expect(button).toContain('document.addEventListener("pointerdown"');
    expect(button).toContain('event.key === "Escape"');
  });
});

describe("parent emails carry the parent name", () => {
  // Shaped like the real records: a plain case, a parent carrying a first
  // name only, a name holding a comma, a field holding two addresses, a pair
  // of siblings against one address, and a student with no email at all.
  const PLAIN: CopyStudent = {
    student_name: "Ava Donnelly",
    parent_name: "Nicole Donnelly",
    parent_email: "alvm1316@gmail.com",
    parent_phone: "0412 345 678",
  };
  const FIRST_NAME_ONLY: CopyStudent = {
    student_name: "Jade Bransby-McKenna",
    parent_name: "Rene",
    parent_email: "mckennaf@gmail.com",
    parent_phone: "0421 891 991",
  };
  const COMMA_NAME: CopyStudent = {
    student_name: "Lorely Aponte",
    parent_name: "Aponte Ortiz, Lorely",
    parent_email: "lorely@ponzanelli.net",
    parent_phone: "0433 112 233",
  };
  const TWO_ADDRESSES: CopyStudent = {
    student_name: "Sithuni De Silva",
    parent_name: "Dinusha De Silva",
    parent_email: "dinusha@example.com; dinusha.work@example.com",
    parent_phone: "0444 555 666",
  };
  const SIB_ONE: CopyStudent = {
    student_name: "Ruby Ashford",
    parent_name: "Kate Ashford",
    parent_email: "ashford@example.com",
    parent_phone: "0400 111 222",
  };
  const SIB_TWO: CopyStudent = {
    student_name: "Tom Ashford",
    parent_name: "Paul Ashford",
    // Written the other way in the records, which is still one address.
    parent_email: " Ashford@Example.com ",
    parent_phone: "0400 111 222",
  };
  const NO_EMAIL: CopyStudent = {
    student_name: "Bo Ng",
    parent_name: "Hien Ng",
    parent_email: null,
    parent_phone: "0455 666 777",
  };

  const SET: CopyStudent[] = [
    PLAIN,
    FIRST_NAME_ONLY,
    COMMA_NAME,
    TWO_ADDRESSES,
    SIB_ONE,
    SIB_TWO,
    NO_EMAIL,
  ];

  test("a parent email is printed with the parent name attached", () => {
    const result = copyRows(SET, "emails");
    expect(result.text).toBe(
      [
        "Nicole Donnelly <alvm1316@gmail.com>",
        "Rene <mckennaf@gmail.com>",
        '"Aponte Ortiz, Lorely" <lorely@ponzanelli.net>',
        "Dinusha De Silva <dinusha@example.com>",
        "Kate Ashford <ashford@example.com>",
      ].join(", "),
    );
    // Still one line, still comma separated.
    expect(result.text.includes("\n")).toBe(false);
    // Seven shown, one with no email and one sibling collapsed.
    expect(SET).toHaveLength(7);
    expect(result.count).toBe(5);
  });

  test("a blank parent name falls back to the bare address", () => {
    for (const parent of [null, "", "   "]) {
      const line = copyRows([{ ...PLAIN, parent_name: parent }], "emails").text;
      expect(line).toBe("alvm1316@gmail.com");
      expect(line).not.toContain("<");
      expect(line).not.toContain(">");
      // It is still copied, and still counted.
      expect(copyRows([{ ...PLAIN, parent_name: parent }], "emails").count).toBe(1);
    }
    // A first name only is a name, not a blank. Six parents on the roster
    // carry one.
    expect(copyRows([FIRST_NAME_ONLY], "emails").text).toBe("Rene <mckennaf@gmail.com>");
  });

  test("a name containing a comma is quoted", () => {
    expect(copyRows([COMMA_NAME], "emails").text).toBe(
      '"Aponte Ortiz, Lorely" <lorely@ponzanelli.net>',
    );
    // Without the quoting the comma would split one recipient into two and
    // every address after it would land against the wrong name.
    expect(copyRows([COMMA_NAME, PLAIN], "emails").text).toBe(
      '"Aponte Ortiz, Lorely" <lorely@ponzanelli.net>, Nicole Donnelly <alvm1316@gmail.com>',
    );
    // The other characters that end a display name early are quoted for the
    // same reason.
    const quoted: [string, string][] = [
      ["Dr. Whelan", '"Dr. Whelan"'],
      ["Whelan; Ann", '"Whelan; Ann"'],
      ["Ann <Annie> Whelan", '"Ann <Annie> Whelan"'],
      ["Whelan > Ann", '"Whelan > Ann"'],
    ];
    for (const [name, wrapped] of quoted) {
      expect(copyRows([{ ...PLAIN, parent_name: name }], "emails").text).toBe(
        `${wrapped} <alvm1316@gmail.com>`,
      );
    }
    // A name with none of them is left alone, hyphens and apostrophes
    // included, since quoting every name would be noise.
    expect(copyRows([PLAIN], "emails").text).toBe("Nicole Donnelly <alvm1316@gmail.com>");
    expect(copyRows([{ ...PLAIN, parent_name: "Anne-Marie O'Brien" }], "emails").text).toBe(
      "Anne-Marie O'Brien <alvm1316@gmail.com>",
    );
  });

  test("a double quote inside a name is escaped", () => {
    const text = copyRows([{ ...PLAIN, parent_name: 'Ann "Annie" Whelan' }], "emails").text;
    expect(text).toBe('"Ann \\"Annie\\" Whelan" <alvm1316@gmail.com>');
    // Spelled out, so the escaping above cannot be read as the test's own:
    // the name is wrapped, and each inner quote carries exactly one
    // backslash.
    expect(text.startsWith('"Ann')).toBe(true);
    expect(text.split('\\"')).toHaveLength(3);
    expect(text).not.toContain("\\\\");
    // A quote is enough on its own to make a name need wrapping.
    expect(copyRows([{ ...PLAIN, parent_name: 'Ann "Annie"' }], "emails").text).toBe(
      '"Ann \\"Annie\\"" <alvm1316@gmail.com>',
    );
  });

  test("a field holding two addresses separated by a semicolon copies the first", () => {
    const text = copyRows([TWO_ADDRESSES], "emails").text;
    expect(text).toBe("Dinusha De Silva <dinusha@example.com>");
    // The whole field would not be a valid address list.
    expect(text).not.toContain(";");
    expect(text).not.toContain("dinusha.work");
    // One recipient, not two.
    expect(copyRows([TWO_ADDRESSES], "emails").count).toBe(1);
    // Trimmed after the split, not before it.
    expect(
      copyRows([{ ...PLAIN, parent_email: "  first@example.com ;second@example.com " }], "emails")
        .text,
    ).toBe("Nicole Donnelly <first@example.com>");
    // Three is the same rule as two.
    expect(
      copyRows([{ ...PLAIN, parent_email: "a@example.com;b@example.com;c@example.com" }], "emails")
        .text,
    ).toBe("Nicole Donnelly <a@example.com>");
  });

  test("siblings sharing an address still appear once", () => {
    const result = copyRows([SIB_ONE, SIB_TWO], "emails");
    // The first parent name against the address is the one printed.
    expect(result.text).toBe("Kate Ashford <ashford@example.com>");
    expect(result.count).toBe(1);
    // Two different names against one address is still one recipient, so
    // the comparison cannot be on the printed line.
    expect(SIB_ONE.parent_name).not.toBe(SIB_TWO.parent_name);
    // Reversed, the other name wins, which is the same rule.
    expect(copyRows([SIB_TWO, SIB_ONE], "emails").text).toBe("Paul Ashford <Ashford@Example.com>");
    // And it is compared after the semicolon rule, so a second address in
    // the field cannot smuggle a duplicate through.
    const alsoKate: CopyStudent = {
      ...SIB_ONE,
      student_name: "Mia Ashford",
      parent_email: "ashford@example.com; kate@work.com",
    };
    expect(copyRows([SIB_ONE, alsoKate], "emails").count).toBe(1);
  });

  test("a student with no email is still skipped and not counted", () => {
    const result = copyRows(SET, "emails");
    expect(result.text).not.toContain("Hien Ng");
    expect(result.text).not.toContain("Bo Ng");
    expect(result.count).toBe(5);
    // Blank and whitespace only are the same as absent.
    for (const email of [null, "", "   "]) {
      expect(copyRows([{ ...PLAIN, parent_email: email }], "emails").count).toBe(0);
    }
    // A field holding nothing but a separator has no address in it either,
    // and an empty pair of brackets in a BCC line is worse than a shorter
    // list.
    expect(copyRows([{ ...PLAIN, parent_email: " ; " }], "emails").count).toBe(0);
    expect(copyRows([{ ...PLAIN, parent_email: " ; " }], "emails").text).toBe("");
    // The count is what the button reports.
    expect(copyLabel({ kind: "copied", count: result.count })).toBe("5 copied");
  });

  test("the other three formats are unchanged", () => {
    expect(copyRows(SET, "names").text).toBe(
      [
        "Ava Donnelly",
        "Jade Bransby-McKenna",
        "Lorely Aponte",
        "Sithuni De Silva",
        "Ruby Ashford",
        "Tom Ashford",
        "Bo Ng",
      ].join(", "),
    );
    expect(copyRows(SET, "parents").text).toBe(
      [
        "Ava Donnelly, Nicole Donnelly",
        "Jade Bransby-McKenna, Rene",
        "Lorely Aponte, Aponte Ortiz, Lorely",
        "Sithuni De Silva, Dinusha De Silva",
        "Ruby Ashford, Kate Ashford",
        "Tom Ashford, Paul Ashford",
        "Bo Ng, Hien Ng",
      ].join("\n"),
    );
    expect(copyRows(SET, "phones").text).toBe(
      [
        "Ava Donnelly, Nicole Donnelly, 0412 345 678",
        "Jade Bransby-McKenna, Rene, 0421 891 991",
        "Lorely Aponte, Aponte Ortiz, Lorely, 0433 112 233",
        "Sithuni De Silva, Dinusha De Silva, 0444 555 666",
        "Ruby Ashford, Kate Ashford, 0400 111 222",
        "Tom Ashford, Paul Ashford, 0400 111 222",
        "Bo Ng, Hien Ng, 0455 666 777",
      ].join("\n"),
    );
    for (const format of ["names", "parents", "phones"] as const) {
      const { text, count } = copyRows(SET, format);
      // No angle brackets, no quoting, no semicolon rule.
      expect(text).not.toContain("<");
      expect(text).not.toContain('"');
      // And no deduplication: the sibling pair is two students everywhere
      // but the email format, and the student with no email is still in
      // all three.
      expect(count).toBe(7);
    }
  });

  test("the menu says the names come with it", () => {
    const emails = COPY_OPTIONS.find((option) => option.key === "emails");
    expect(emails?.label).toBe("Parent emails");
    expect(emails?.hint).toBe("Named, for pasting into BCC");
    // The other three descriptions are untouched.
    expect(COPY_OPTIONS.map((option) => option.hint)).toEqual([
      "One line, comma separated",
      "One per line",
      "Named, for pasting into BCC",
      "One per line, for a call sheet",
    ]);
  });
});
