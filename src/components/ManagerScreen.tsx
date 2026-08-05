import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  formatSydneyFullDate,
  sydneyDateIso,
  sydneyHourOf,
  sydneyTodayIso,
  sydneyTomorrowIso,
} from "../lib/dates";
import { fetchPinHash, hashPin, isValidPin, savePinHash } from "../lib/pin";
import { supabase } from "../lib/supabase";
import { LockIcon, TickIcon } from "./Icons";

type TouchPoint = {
  id: string;
  person_name: string;
  what_about: string;
  due_date: string;
  done: boolean;
  done_at: string | null;
};

type GateState = "checking" | "setup" | "locked" | "unlocked" | "failed";

type ManagerScreenProps = {
  // The fifteen minute unlock window lives in the route, in memory only, so
  // it survives tab switches but never a reload or sign out.
  onUnlock: () => void;
  unlockRemainingMs: () => number;
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

export function ManagerScreen({ onUnlock, unlockRemainingMs }: ManagerScreenProps) {
  const [gate, setGate] = useState<GateState>(() =>
    unlockRemainingMs() > 0 ? "unlocked" : "checking",
  );
  const [storedHash, setStoredHash] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [pinEntry, setPinEntry] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const pinRef = useRef<HTMLInputElement | null>(null);

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

  // Find out whether a PIN exists whenever the gate needs deciding.
  useEffect(() => {
    if (gate !== "checking") return;
    let cancelled = false;
    fetchPinHash().then(({ hash, failed }) => {
      if (cancelled) return;
      if (failed) {
        setGate("failed");
        return;
      }
      setStoredHash(hash);
      setGate(hash ? "locked" : "setup");
    });
    return () => {
      cancelled = true;
    };
  }, [gate]);

  // While unlocked, watch the clock and lock the screen the moment the
  // fifteen minutes run out.
  useEffect(() => {
    if (gate !== "unlocked") return;
    const check = () => {
      if (unlockRemainingMs() <= 0) setGate("checking");
    };
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [gate, unlockRemainingMs]);

  // Any interaction with the unlocked screen restarts the fifteen minutes.
  function touchActivity() {
    if (gate === "unlocked") onUnlock();
  }

  // The what to talk about box grows with its text.
  useEffect(() => {
    const el = whatRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [what, gate]);

  useEffect(() => {
    if (gate !== "unlocked") return;
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
  }, [gate]);

  async function handleSetupSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gateBusy) return;
    if (!isValidPin(setupPin)) {
      setGateMessage("A PIN is exactly four digits.");
      return;
    }
    if (setupPin !== setupConfirm) {
      setGateMessage("The two PINs do not match.");
      return;
    }
    setGateBusy(true);
    setGateMessage(null);
    const hash = await hashPin(setupPin);
    const ok = await savePinHash(hash);
    setGateBusy(false);
    if (!ok) {
      setGateMessage("The change could not be saved. Please try again.");
      return;
    }
    setStoredHash(hash);
    setSetupPin("");
    setSetupConfirm("");
    onUnlock();
    setGate("unlocked");
  }

  async function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gateBusy || !storedHash) return;
    setGateBusy(true);
    setGateMessage(null);
    const hash = await hashPin(pinEntry);
    setGateBusy(false);
    if (hash !== storedHash) {
      setGateMessage("That PIN is not right.");
      setPinEntry("");
      pinRef.current?.focus();
      return;
    }
    setPinEntry("");
    onUnlock();
    setGate("unlocked");
  }

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

  if (gate === "checking") {
    return (
      <div className="manager-gate">
        <p className="manager-gate-status">Loading</p>
      </div>
    );
  }

  if (gate === "failed") {
    return (
      <div className="manager-gate">
        <p className="manager-gate-status" role="alert">
          The Manager screen could not be loaded. Please try again.
        </p>
      </div>
    );
  }

  if (gate === "setup") {
    return (
      <div className="manager-gate">
        <form className="gate-card" onSubmit={handleSetupSave}>
          <LockIcon className="gate-icon" size={24} />
          <h2 className="gate-heading">Set a PIN</h2>
          <p className="gate-sub">This keeps the Manager screen private on a shared device.</p>
          <label className="field-label" htmlFor="setup-pin">
            New PIN
          </label>
          <input
            id="setup-pin"
            className="text-field pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={setupPin}
            onChange={(event) => {
              setSetupPin(event.target.value.replace(/\D/g, "").slice(0, 4));
              setGateMessage(null);
            }}
          />
          <label className="field-label" htmlFor="setup-pin-confirm">
            Confirm PIN
          </label>
          <input
            id="setup-pin-confirm"
            className="text-field pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={setupConfirm}
            onChange={(event) => {
              setSetupConfirm(event.target.value.replace(/\D/g, "").slice(0, 4));
              setGateMessage(null);
            }}
          />
          <button type="submit" className="primary-button gate-button" disabled={gateBusy}>
            {gateBusy ? "Saving..." : "Save PIN"}
          </button>
          {gateMessage ? (
            <p className="gate-message" role="alert">
              {gateMessage}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  if (gate === "locked") {
    return (
      <div className="manager-gate">
        <form className="gate-card" onSubmit={handleUnlockSubmit}>
          <LockIcon className="gate-icon" size={24} />
          <h2 className="gate-heading">Manager</h2>
          <p className="gate-sub">Enter your PIN to open this screen.</p>
          <label className="field-label" htmlFor="manager-pin">
            PIN
          </label>
          <input
            id="manager-pin"
            className="text-field pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            ref={pinRef}
            value={pinEntry}
            onChange={(event) => {
              setPinEntry(event.target.value.replace(/\D/g, "").slice(0, 4));
              setGateMessage(null);
            }}
          />
          <button type="submit" className="primary-button gate-button" disabled={gateBusy}>
            {gateBusy ? "Checking..." : "Unlock"}
          </button>
          {gateMessage ? (
            <p className="gate-message" role="alert">
              {gateMessage}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  const today = sydneyTodayIso();
  const tomorrow = sydneyTomorrowIso();
  const loading = items === null;
  const openCount = items?.length ?? 0;

  return (
    <section
      className="manager-screen"
      onPointerDownCapture={touchActivity}
      onKeyDownCapture={touchActivity}
    >
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
          <span className="manager-count">
            {openCount} {openCount === 1 ? "open" : "open"}
          </span>
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
