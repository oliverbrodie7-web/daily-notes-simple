import { useState, type ReactNode } from "react";
import {
  BOARD_COLUMNS,
  NONE_EXPANDED,
  pageColumn,
  splitIntoColumns,
  toggleExpanded,
  type ExpandedColumns,
} from "../lib/board";
import { touchDisplay } from "../lib/touchDots";
import type { ContactStatus } from "../lib/p2";
import type { Engagement } from "../lib/engagement";
import { EngagementBar } from "./Engagement";
import { TouchDots } from "./TouchDots";

// The Board view on the Parents screen.
//
// It is handed the rows the table would show, already sorted, filtered and
// searched, so the two views can never disagree about which students are on
// screen. All this does is put each row in one of four columns and draw it.
//
// Nothing here works out a P2 state. done, overdue and status arrive
// already decided, and lib/board.ts only chooses between them.

type BoardStudent = {
  id: number | string;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
};

export type BoardEntry = {
  student: BoardStudent;
  status: ContactStatus;
  done: boolean;
  overdue: boolean;
  touchPoints: number;
  emails: Engagement;
  // The same line the table's row shows, built once where the rows are.
  lastContact: string | null;
};

type RosterBoardProps = {
  rows: BoardEntry[];
  // False while today is still inside the first fortnight, when the
  // engagement bar says so rather than showing a level.
  counting: boolean;
  openId: string | null;
  onOpen: (studentId: string) => void;
  // The panel that belongs under this card, or null. It comes from the
  // screen so the board and the table expand the very same one.
  panelFor: (row: BoardEntry) => ReactNode;
};

type CardProps = {
  row: BoardEntry;
  columnName: string;
  counting: boolean;
  open: boolean;
  onOpen: (studentId: string) => void;
  panel: ReactNode;
};

function BoardCard({ row, columnName, counting, open, onOpen, panel }: CardProps) {
  const { student } = row;
  const name = student.student_name;
  // The same pairing the table's touch points cell makes, from the same
  // numbers.
  const touch = touchDisplay(row.touchPoints, row.emails.replies);
  return (
    <li className="board-item">
      <button
        type="button"
        className="board-card"
        aria-expanded={open}
        // Name and P2 state, then what tapping does. The label replaces the
        // card's contents for a screen reader, so it says the two things
        // that matter rather than reading every line.
        aria-label={`${name}, ${columnName}. Open the contact history.`}
        onClick={() => onOpen(String(student.id))}
      >
        <span className="board-card-name">{name}</span>
        <span className="board-card-sub">
          <span className="board-card-parent">{student.parent_name ?? "No parent name"}</span>
          {student.parent_phone ? (
            <span className="board-card-phone">{student.parent_phone}</span>
          ) : null}
        </span>
        <span className="board-card-rule" aria-hidden="true" />
        {/* No onOpen: the whole card is the button, and a second one inside
            it could not be tapped. */}
        <EngagementBar engagement={row.emails} counting={counting} studentName={name} />
        <span className="board-card-touch">
          <TouchDots touch={touch} />
        </span>
        <span className="board-card-last">{row.lastContact ?? "Nothing logged this term"}</span>
      </button>
      {panel}
    </li>
  );
}

export function RosterBoard({ rows, counting, openId, onOpen, panelFor }: RosterBoardProps) {
  // Per column, and remembered while the screen is open. A column that
  // drops below the first page loses its control anyway, so a filter can
  // never leave this stuck open on something invisible.
  const [expanded, setExpanded] = useState<ExpandedColumns>(NONE_EXPANDED);

  const columns = splitIntoColumns(rows);

  return (
    <div className="roster-board">
      {BOARD_COLUMNS.map((column) => {
        const held = columns[column.key];
        const page = pageColumn(held, expanded[column.key]);
        const countLabel = `${held.length} ${held.length === 1 ? "student" : "students"}`;
        return (
          <section
            key={column.key}
            className={`board-column board-column-${column.tone}`}
            aria-label={`${column.name}, ${countLabel}`}
          >
            <p className="board-column-head">
              <span className="board-column-name">{column.name}</span>
              <span className="board-column-count">{held.length}</span>
            </p>
            {held.length === 0 ? (
              <p className="board-empty">{column.empty}</p>
            ) : (
              <ul className="board-list">
                {page.shown.map((row) => (
                  <BoardCard
                    key={String(row.student.id)}
                    row={row}
                    columnName={column.name}
                    counting={counting}
                    open={openId === String(row.student.id)}
                    onOpen={onOpen}
                    panel={panelFor(row)}
                  />
                ))}
              </ul>
            )}
            {page.more ? (
              <button
                type="button"
                className="board-more"
                aria-expanded={expanded[column.key]}
                aria-label={`${page.more} in ${column.name}`}
                onClick={() => setExpanded((current) => toggleExpanded(current, column.key))}
              >
                {page.more}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
