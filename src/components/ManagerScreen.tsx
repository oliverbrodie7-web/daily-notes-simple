import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PinGate } from "../hooks/usePinGate";
import {
  formatSydneyFullDate,
  sydneyDateIso,
  sydneyHourOf,
  sydneyTodayIso,
  sydneyTomorrowIso,
} from "../lib/dates";
import { supabase } from "../lib/supabase";
import { LockGate } from "./LockGate";
import { ScreenSubtitle } from "./ScreenBar";
import { TickIcon } from "./Icons";

type TouchPoint = {
  id: string;
  person_name: string;
  what_about: string;
  due_date: string;
  done: boolean;
  done_at: string | null;
};

type ManagerScreenProps = {
  pinGate: PinGate;
};

const TOUCH_POINT_COLUMNS = "id, person_name, what_about, due_date, done, done_at";

function sortByDue(items: TouchPoint[]): TouchPoint[] {
  return [...items].sort((a, b) =>
    a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0,
  );
}

function dueLine(due: string, today: string, tomorrow: string): { text: string; overdue: boolean } {
  if (due < today) return { text: `Overdue, was ${formatSydneyFullDate(due)}`, overdue: true };
  if (due === today) return { text: "By today", overdue: false };
  if (due === tomorrow) {
    return { text: `By tomorrow, ${formatSydneyFullDate(due)}`, overdue: false };
  }
  return { text: `By ${formatSydneyFullDate(due)}`, overdue: false };
}

export function ManagerScreen({ pinGate }: ManagerScreenProps) {
  const unlocked = pinGate.state === "unlocked";

  const [items, setItems] = useState<TouchPoint[] | null>(null);
  const [doneToday, setDoneToday] = useState<TouchPoint[]>([]);
  const [listFailed, setListFailed] = useState(false);
  const [listMessage, setListMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [dueDate, setDueDate] = useState(sydneyTomorrowIso);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const whoRef = useRef<HTMLInputElement | null>(null);
  const whatRef = useRef<HTMLTextAreaElement | null>(null);

  // The what to talk about box grows with its text.
  useEffect(() => {
    const el = whatRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [what, unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [open, done] = await Promise.all([
        supabase
          .from("manager_touch_points")
          .select(TOUCH_POINT_COLUMNS)
          .eq("done", false)
          .order("due_date", { ascending: true }),
        supabase
          .from("manager_touch_points")
          .select(TOUCH_POINT_COLUMNS)
          .eq("done", true)
          .gte("done_at", since)
          .order("done_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (open.error || done.error) {
        setListFailed(true);
        setItems([]);
        return;
      }
      const today = sydneyTodayIso();
      setItems((open.data ?? []) as TouchPoint[]);
      setDoneToday(
        ((done.data ?? []) as TouchPoint[]).filter(
          (item) => item.done_at && sydneyDateIso(new Date(item.done_at)) === today,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  async function handleAdd() {
    if (saving) return;
    const person = who.trim();
    const about = what.trim();
    if (!person || !about || !dueDate) {
      setFormMessage("Add who to talk to, what to talk about, and a date.");
      return;
    }
    setSaving(true);
    setFormMessage(null);
    const { data, error } = await supabase
      .from("manager_touch_points")
      .insert({ person_name: person, what_about: about, due_date: dueDate, done: false })
      .select(TOUCH_POINT_COLUMNS)
      .single();
    setSaving(false);
    if (error || !data) {
      setFormMessage("The change could not be saved. Please try again.");
      return;
    }
    setItems((current) => sortByDue([...(current ?? []), data as TouchPoint]));
    setWho("");
    setWhat("");
    setDueDate(sydneyTomorrowIso());
    whoRef.current?.focus();
  }

  function handleWhoKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (saving) return;
    if (event.ctrlKey || event.metaKey) {
      void handleAdd();
      return;
    }
    whatRef.current?.focus();
  }

  function handleSaveKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (!saving) void handleAdd();
  }

  async function handleTick(item: TouchPoint) {
    if (busyId) return;
    setBusyId(item.id);
    setListMessage(null);
    const doneAt = new Date().toISOString();
    const { error } = await supabase
      .from("manager_touch_points")
      .update({ done: true, done_at: doneAt })
      .eq("id", item.id);
    setBusyId(null);
    if (error) {
      setListMessage("The change could not be saved. Please try again.");
      return;
    }
    setItems((current) => (current ?? []).filter((entry) => entry.id !== item.id));
    setDoneToday((current) => [{ ...item, done: true, done_at: doneAt }, ...current]);
  }

  async function handleUntick(item: TouchPoint) {
    if (busyId) return;
    setBusyId(item.id);
    setListMessage(null);
    const { error } = await supabase
      .from("manager_touch_points")
      .update({ done: false, done_at: null })
      .eq("id", item.id);
    setBusyId(null);
    if (error) {
      setListMessage("The change could not be saved. Please try again.");
      return;
    }
    setDoneToday((current) => current.filter((entry) => entry.id !== item.id));
    setItems((current) => sortByDue([...(current ?? []), { ...item, done: false, done_at: null }]));
  }

  // The bar belongs to the shell now, so a locked screen keeps it without
  // this having to render one.
  if (!unlocked) {
    return <LockGate heading="Manager" gate={pinGate} />;
  }

  const today = sydneyTodayIso();
  const tomorrow = sydneyTomorrowIso();
  const loading = items === null;
  const openCount = items?.length ?? 0;
  const openLabel = loading
    ? null
    : `${openCount} open touch ${openCount === 1 ? "point" : "points"}`;

  return (
    <section
      className="manager-screen"
      onPointerDownCapture={pinGate.touch}
      onKeyDownCapture={pinGate.touch}
    >
      <ScreenSubtitle>{openLabel}</ScreenSubtitle>
      <div className="manager-input-card">
        <label className="field-label" htmlFor="manager-who">
          Who
        </label>
        <input
          id="manager-who"
          className="text-field"
          type="text"
          ref={whoRef}
          value={who}
          onChange={(event) => {
            setWho(event.target.value);
            setFormMessage(null);
          }}
          onKeyDown={handleWhoKeyDown}
        />
        <label className="field-label" htmlFor="manager-what">
          What to talk about
        </label>
        <textarea
          id="manager-what"
          className="text-field manager-what-entry"
          rows={4}
          ref={whatRef}
          value={what}
          onChange={(event) => {
            setWhat(event.target.value);
            setFormMessage(null);
          }}
          onKeyDown={handleSaveKeys}
        />
        <label className="field-label" htmlFor="manager-due">
          Talk to them by
        </label>
        <input
          id="manager-due"
          className="text-field"
          type="date"
          value={dueDate}
          onChange={(event) => {
            setDueDate(event.target.value);
            setFormMessage(null);
          }}
          onKeyDown={handleSaveKeys}
        />
        {formMessage ? (
          <p className="today-form-message" role="alert">
            {formMessage}
          </p>
        ) : null}
        <button
          type="button"
          className="primary-button manager-add"
          disabled={saving}
          onClick={handleAdd}
        >
          {saving ? "Adding..." : "Add touch point"}
        </button>
      </div>

      <div className="manager-list-section">
        <div className="manager-list-head">
          <h2 className="section-heading">To do</h2>
        </div>
        {listMessage ? (
          <p className="manager-message" role="alert">
            {listMessage}
          </p>
        ) : null}
        {loading ? (
          <p className="manager-message">Loading touch points</p>
        ) : listFailed ? (
          <p className="manager-message" role="alert">
            The touch points could not be loaded. Please try again.
          </p>
        ) : (
          <>
            {openCount === 0 ? (
              <p className="manager-message">Nothing to follow up. Add one above.</p>
            ) : (
              <ul className="tp-list">
                {(items ?? []).map((item) => {
                  const due = dueLine(item.due_date, today, tomorrow);
                  return (
                    <li key={item.id} className={`tp-item${due.overdue ? " is-overdue" : ""}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked="false"
                        aria-label={`Mark ${item.person_name} as done`}
                        className="tp-tick"
                        disabled={busyId === item.id}
                        onClick={() => handleTick(item)}
                      />
                      <div className="tp-details">
                        <p className="tp-name">{item.person_name}</p>
                        <p className="tp-what">{item.what_about}</p>
                        <p className={`tp-due${due.overdue ? " is-overdue" : ""}`}>{due.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {doneToday.length > 0 ? (
              <>
                <h3 className="manager-done-heading">Done today</h3>
                <ul className="tp-list">
                  {doneToday.map((item) => (
                    <li key={item.id} className="tp-item is-done">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked="true"
                        aria-label={`Mark ${item.person_name} as not done`}
                        className="tp-tick is-ticked"
                        disabled={busyId === item.id}
                        onClick={() => handleUntick(item)}
                      >
                        <TickIcon size={14} />
                      </button>
                      <div className="tp-details">
                        <p className="tp-name">{item.person_name}</p>
                        <p className="tp-what">{item.what_about}</p>
                        <p className="tp-due">
                          Ticked off this{" "}
                          {item.done_at && sydneyHourOf(item.done_at) < 12
                            ? "morning"
                            : "afternoon"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
