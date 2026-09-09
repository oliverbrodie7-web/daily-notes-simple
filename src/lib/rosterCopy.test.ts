import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import {
  COPY_DEFAULT,
  COPY_FAILED_LABEL,
  COPY_IDLE,
  COPY_IDLE_LABEL,
  COPY_OPTIONS,
  copyLabel,
  copyMenuTitle,
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
    expect(result.text).toBe("ava@example.com, jade@example.com");
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
    expect(copyRows([messy], "emails").text).toBe("ava@example.com");
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
    expect(result.text).toBe("ava@example.com, jade@example.com");
    expect(result.count).toBe(2);
  });

  test("parent emails are deduplicated across siblings", () => {
    const one = student({ student_name: "Ruby Ashford", parent_email: "ashford@example.com" });
    const two = student({ student_name: "Tom Ashford", parent_email: "ashford@example.com" });
    // Written both ways in the records, which is still one address.
    const three = student({ student_name: "Mia Ashford", parent_email: " Ashford@Example.com " });
    const result = copyRows([one, two, three, AVA], "emails");
    expect(result.text).toBe("ashford@example.com, ava@example.com");
    expect(result.count).toBe(2);
  });

  test("the count in the label is what was copied, not what was shown", () => {
    const shown = [AVA, student({ student_name: "Bo Ng", parent_email: null }), JADE];
    expect(shown).toHaveLength(3);
    const result = copyRows(shown, "emails");
    expect(result.count).toBe(2);
    expect(copyLabel({ kind: "copied", count: result.count })).toBe("2 copied");
    // And the menu heading still counts what is on screen, because it is
    // written before a format is chosen.
    expect(copyMenuTitle(shown.length)).toBe("Copy 3 students");
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
