import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ROSTER_MISSING,
  SHAPE_NOTE,
  duplicateWarnings,
  inBatch,
  noteBody,
  strippedInitials,
  toCards,
  type BulkCard,
  type BulkParseResult,
} from "../lib/bulkNotes";
import { sydneyTodayIso } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { matchNote } from "../lib/touchPoints";
import { MatchStudentPanel, type PickerStudent } from "./MatchStudentPanel";
import { TickIcon, WarningIcon } from "./Icons";

type BulkUploadPanelProps = {
  fileName: string;
  // Null while the file is still being read, which is usually a blink.
  result: BulkParseResult | null;
  // Set when the file could not be opened as a Word document at all.
  readFailed: boolean;
  students: PickerStudent[];
  // Every note already on today's list, as name and text squashed together.
  existingKeys: Set<string>;
  onClose: () => void;
  onSaved: () => void;
};

// The batch is held in this panel and nowhere else. Nothing reaches
// daily_notes until the button at the bottom is pressed, and closing the
// panel throws the lot away.
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Every note from a document is stamped this way, so the Added today list
// says where it came from without anybody having to type a name.
const ADDED_BY = "Bulk upload";

const NO_CARDS: BulkCard[] = [];

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function BulkUploadPanel({
  fileName,
  result,
  readFailed,
  students,
  existingKeys,
  onClose,
  onSaved,
}: BulkUploadPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const [cards, setCards] = useState<BulkCard[] | null>(null);
  const [builtFor, setBuiltFor] = useState<BulkParseResult | null>(null);
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Built the moment a clean read arrives, while rendering rather than after
  // it, so the list never flashes as empty first. It is keyed off the result
  // itself, so today's list changing underneath cannot rebuild the batch and
  // throw away what has been skipped or matched by hand.
  if (result && result.ok && builtFor !== result) {
    setBuiltFor(result);
    setCards(toCards(result.students, result.unrecognised, existingKeys));
  }

  // The error state turns into a preview when a person asks for the students
  // it did read before it stopped.
  const showing = cards !== null;

  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Escape closes the picker first when it is open, so one press never
  // throws the whole batch away.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (pickingKey) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pickingKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (el) => !el.hasAttribute("disabled"),
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const onPanel = document.activeElement === panelRef.current;
    if (event.shiftKey && (document.activeElement === first || onPanel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const shown = cards ?? NO_CARDS;
  const warnings = useMemo(
    // Nameless blocks are left out: they all share the empty name and would
    // warn about each other.
    () =>
      duplicateWarnings(
        shown.map((card) => (card.unrecognised ? { name: "\u0000" } : card.student)),
      ),
    // The names never change once the cards are built, so the map only has to
    // be worked out when the batch itself does.
    [shown],
  );

  const statuses = useMemo(
    () =>
      shown.map((card) =>
        matchNote({ student_id: card.studentId, student_name: card.student.name }, students),
      ),
    [shown, students],
  );

  const matchedCount = statuses.filter((status) => status.kind === "matched").length;
  const unrecognisedCount = shown.filter((card) => card.unrecognised).length;
  const namedCount = shown.length - unrecognisedCount;
  // A nameless block needs a student too, but it is counted as unrecognised
  // rather than twice.
  const needStudent = statuses.length - matchedCount - unrecognisedCount;
  const skippedCount = shown.filter((card) => card.skipped).length;
  const alreadyCount = shown.filter((card) => card.alreadyAdded).length;
  const willAdd = shown.filter(inBatch).length;

  function update(key: string, change: Partial<BulkCard>) {
    setCards((current) =>
      (current ?? []).map((card) => (card.key === key ? { ...card, ...change } : card)),
    );
  }

  function handlePicked(student: PickerStudent) {
    if (pickingKey) update(pickingKey, { studentId: String(student.id) });
    setPickingKey(null);
  }

  async function handleSave() {
    if (saving) return;
    const batch = shown.filter(inBatch);
    if (batch.length === 0) return;
    setSaving(true);
    setMessage(null);

    // One at a time, so a single refusal is reported as itself rather than
    // taking the whole batch down with it.
    const failed: BulkCard[] = [];
    let added = 0;
    for (const card of batch) {
      // The same shape a typed note is saved with, plus the id when a person
      // picked one. Everything else about the row is left to the database.
      const base = {
        student_name: card.student.name,
        note_text: card.student.noteText,
        note_date: sydneyTodayIso(),
        collated: false,
        draft_created: false,
        no_match: false,
        added_by: ADDED_BY,
      };
      const row = card.studentId ? { ...base, student_id: card.studentId } : base;
      const { error } = await supabase.from("daily_notes").insert(row);
      if (error) failed.push(card);
      else added += 1;
    }

    setSaving(false);
    if (added > 0) onSaved();
    if (failed.length === 0) {
      onClose();
      return;
    }
    setCards(failed);
    setMessage(
      `${added} ${added === 1 ? "note was" : "notes were"} added. ${failed.length} ${
        failed.length === 1 ? "was" : "were"
      } not, and ${failed.length === 1 ? "it is" : "they are"} still here.`,
    );
  }

  const picking = pickingKey ? shown.find((card) => card.key === pickingKey) : undefined;
  const pickingStatus = picking
    ? matchNote({ student_id: picking.studentId, student_name: picking.student.name }, students)
    : undefined;

  return (
    <div
      className="bulk-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bulk-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {!result && !readFailed ? (
          <>
            <p className="bulk-title" id="bulk-title">
              Reading the document
            </p>
            <p className="bulk-file">{fileName}</p>
          </>
        ) : readFailed ? (
          <>
            <p className="bulk-title" id="bulk-title">
              This document could not be read
            </p>
            <p className="bulk-file">{fileName}</p>
            <div className="bulk-error">
              <p className="bulk-error-line">
                This file could not be opened as a Word document. It may be damaged, or saved in the
                older .doc format.
              </p>
            </div>
          </>
        ) : result && !result.ok && !showing ? (
          <>
            <p className="bulk-title" id="bulk-title">
              {/* A roster that has not arrived is not the document's fault,
                  and saying it was sends somebody to check the wrong thing. */}
              {result.reason === ROSTER_MISSING
                ? "Not ready yet"
                : "This document could not be read"}
            </p>
            <p className="bulk-file">{fileName}</p>
            <div className="bulk-error">
              <p className="bulk-error-line">{result.reason}</p>
              {result.text ? (
                <p className="bulk-error-found">The document starts: {result.text}</p>
              ) : null}
            </div>
            {result.reason === ROSTER_MISSING ? null : <p className="bulk-shape">{SHAPE_NOTE}</p>}
          </>
        ) : (
          <>
            <p className="bulk-title" id="bulk-title">
              {/* Named students only. A block that anchored on nobody has no
                  name to have been found, and its own chip counts it. */}
              {namedCount} {namedCount === 1 ? "student" : "students"} found
            </p>
            <p className="bulk-file">{fileName}</p>

            <ul className="bulk-chips">
              <li className={`bulk-chip${matchedCount > 0 ? " is-good" : ""}`}>
                {matchedCount} matched
              </li>
              <li className={`bulk-chip${needStudent > 0 ? " is-warn" : ""}`}>
                {needStudent} need a student
              </li>
              <li className={`bulk-chip${skippedCount > 0 ? " is-quiet" : ""}`}>
                {skippedCount} skipped
              </li>
              <li className={`bulk-chip${alreadyCount > 0 ? " is-quiet" : ""}`}>
                {alreadyCount} already added today
              </li>
              <li className={`bulk-chip${unrecognisedCount > 0 ? " is-warn" : ""}`}>
                {unrecognisedCount} unrecognised
              </li>
            </ul>

            <ul className="bulk-list">
              {shown.map((card, index) => {
                const status = statuses[index];
                const warning = warnings.get(index);
                const quiet = card.skipped || (card.alreadyAdded && !card.includeAnyway);
                const unresolved = Boolean(status) && status!.kind !== "matched";
                // Everything this card dropped, in one quiet line. Tolerant
                // reading is only safe to trust if it says what it left out.
                const initials = strippedInitials(card.student.note);
                const left = [...card.student.ignored, initials].filter(Boolean).join(", ");
                return (
                  <li key={card.key}>
                    {warning ? (
                      <p className="bulk-duplicate">
                        <WarningIcon className="bulk-status-icon" size={15} />
                        {warning}
                      </p>
                    ) : null}
                    <div
                      className={`bulk-card${quiet ? " is-quiet" : ""}${
                        !quiet && unresolved ? " is-warn" : ""
                      }`}
                    >
                      <div className="bulk-card-top">
                        <span className="bulk-card-name">
                          {card.unrecognised ? "No name found" : card.student.name}
                        </span>
                        <span className="bulk-card-status">
                          {card.alreadyAdded && !card.includeAnyway ? (
                            <span className="bulk-status bulk-status-quiet">
                              Already added today
                            </span>
                          ) : status?.kind === "matched" ? (
                            <span className="bulk-status bulk-status-good">
                              <TickIcon className="bulk-status-icon" size={13} />
                              {status.student.student_name}
                            </span>
                          ) : (
                            <span className="bulk-status bulk-status-warn">
                              <WarningIcon className="bulk-status-icon" size={15} />
                              {status?.kind === "ambiguous"
                                ? `${countWord(status.candidates.length)} could match`
                                : "No student found"}
                            </span>
                          )}
                        </span>
                      </div>
                      {card.student.topic ? (
                        <p className="bulk-card-topic">{card.student.topic}</p>
                      ) : null}
                      {/* The note on its own. noteText carries the topic in
                          front of it, and the line above already says it. */}
                      <p className="bulk-card-text">{noteBody(card.student.note)}</p>
                      {left ? <p className="bulk-card-left">Left out: {left}</p> : null}
                      <div className="bulk-card-foot">
                        {unresolved && !card.skipped ? (
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => setPickingKey(card.key)}
                          >
                            Match to a student
                          </button>
                        ) : null}
                        {card.skipped ? (
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => update(card.key, { skipped: false })}
                          >
                            Undo skip
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => update(card.key, { skipped: true })}
                          >
                            Skip this one
                          </button>
                        )}
                        {card.alreadyAdded ? (
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => update(card.key, { includeAnyway: !card.includeAnyway })}
                          >
                            {card.includeAnyway ? "Leave it out" : "Add it anyway"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {message ? (
          <p className="bulk-message" role="alert">
            {message}
          </p>
        ) : null}

        <div className="bulk-actions">
          <button type="button" className="row-button" disabled={saving} onClick={onClose}>
            {showing ? "Cancel" : "Close"}
          </button>
          {showing ? (
            <button
              type="button"
              className="primary-button bulk-save"
              disabled={saving || willAdd === 0}
              onClick={handleSave}
            >
              {saving ? "Adding..." : `Add ${willAdd} ${willAdd === 1 ? "note" : "notes"}`}
            </button>
          ) : null}
        </div>
      </div>

      {picking && pickingStatus && pickingStatus.kind !== "matched" ? (
        <MatchStudentPanel
          noteId={null}
          typedName={picking.student.name}
          candidates={pickingStatus.kind === "ambiguous" ? pickingStatus.candidates : []}
          students={students}
          onMatched={handlePicked}
          onClose={() => setPickingKey(null)}
        />
      ) : null}
    </div>
  );
}
