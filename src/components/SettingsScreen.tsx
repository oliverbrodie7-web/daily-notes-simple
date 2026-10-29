import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { PinGate } from "../hooks/usePinGate";
import { hashPin, isValidPin } from "../lib/pin";
import {
  DEFAULT_QUICK_EMAIL_TOPICS,
  readQuickEmailTopics,
  tidyQuickEmailTopics,
} from "../lib/quickEmail";
import { supabase } from "../lib/supabase";
import {
  DEFAULT_NAV_LABELS,
  GROUP_KEYS,
  MAX_LABEL_LENGTH,
  SCREEN_FIELD_LABELS,
  SCREEN_KEYS,
  checkNavLabels,
  sameNavLabels,
  tidyNavLabels,
  type NavLabels,
} from "../lib/navLabels";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./Icons";
import { LockGate } from "./LockGate";

// The daily_notes_settings table holds exactly one row whose id is always 1.
// This screen only ever reads and updates that row.
const SETTINGS_ROW_ID = 1;

const SAMPLE_NOTE = "Excellent effort today, much improved attitude on last week.";

function fillPlaceholders(text: string): string {
  return text
    .replaceAll("{parent_first_name}", "Sarah")
    .replaceAll("{student_name}", "Charlie")
    .replaceAll("{note}", SAMPLE_NOTE);
}

type SettingsScreenProps = {
  onDirtyChange: (dirty: boolean) => void;
  pinGate: PinGate;
  labels: NavLabels;
  onLabelsChange: (next: NavLabels) => void;
};

export function SettingsScreen({
  onDirtyChange,
  pinGate,
  labels,
  onLabelsChange,
}: SettingsScreenProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [savedSubject, setSavedSubject] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const pinSavedTimer = useRef<number | undefined>(undefined);

  // The screen names. Seeded from what the app is currently showing, so the
  // fields open on the names in use.
  const [draftLabels, setDraftLabels] = useState<NavLabels>(labels);
  const [labelsBusy, setLabelsBusy] = useState(false);
  const [labelsSaved, setLabelsSaved] = useState(false);
  const [labelsMessage, setLabelsMessage] = useState<string | null>(null);
  const labelsSavedTimer = useRef<number | undefined>(undefined);
  const labelsDirty = !sameNavLabels(tidyNavLabels(draftLabels), labels);

  // The quick email topics, seeded with the defaults so the fields show
  // something before the row loads. savedTopics tracks what is effectively
  // stored (the defaults when the column is empty), so the dirty check and
  // the panel agree about what the chips are.
  const [topics, setTopics] = useState<string[]>([...DEFAULT_QUICK_EMAIL_TOPICS]);
  const [savedTopics, setSavedTopics] = useState<string[]>([...DEFAULT_QUICK_EMAIL_TOPICS]);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [topicsSaved, setTopicsSaved] = useState(false);
  const [topicsMessage, setTopicsMessage] = useState<string | null>(null);
  const topicsSavedTimer = useRef<number | undefined>(undefined);
  const topicsDirty = JSON.stringify(tidyQuickEmailTopics(topics)) !== JSON.stringify(savedTopics);

  const dirty = !loading && !loadFailed && (subject !== savedSubject || body !== savedBody);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes_settings")
      .select("email_subject, email_template, quick_email_topics")
      .eq("id", SETTINGS_ROW_ID)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLoadFailed(true);
          setLoading(false);
          return;
        }
        const rowSubject = (data.email_subject as string | null) ?? "";
        const rowBody = (data.email_template as string | null) ?? "";
        setSubject(rowSubject);
        setBody(rowBody);
        setSavedSubject(rowSubject);
        setSavedBody(rowBody);
        // Empty or missing falls back to the six defaults as the starting point.
        const rowTopics = readQuickEmailTopics(data.quick_email_topics);
        setTopics(rowTopics);
        setSavedTopics(rowTopics);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(pinSavedTimer.current), []);
  useEffect(() => () => window.clearTimeout(labelsSavedTimer.current), []);
  useEffect(() => () => window.clearTimeout(topicsSavedTimer.current), []);

  // A rename made somewhere else, or the first read arriving, refreshes the
  // fields as long as nothing is part typed.
  useEffect(() => {
    if (!labelsDirty) setDraftLabels(labels);
    // Only when the stored set changes, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels]);

  async function handlePinSave() {
    if (pinBusy) return;
    if (!isValidPin(newPin)) {
      setPinMessage("A PIN is exactly four digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage("The two new PINs do not match.");
      return;
    }
    setPinBusy(true);
    setPinMessage(null);
    if (pinGate.storedHash) {
      const currentHash = await hashPin(currentPin);
      if (currentHash !== pinGate.storedHash) {
        setPinMessage("That current PIN is not right.");
        setPinBusy(false);
        return;
      }
    }
    const nextHash = await hashPin(newPin);
    const { error } = await supabase
      .from("daily_notes_settings")
      .update({ manager_pin_hash: nextHash })
      .eq("id", SETTINGS_ROW_ID);
    setPinBusy(false);
    if (error) {
      setPinMessage("The change could not be saved. Please try again.");
      return;
    }
    pinGate.notePinChanged(nextHash);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinSaved(true);
    window.clearTimeout(pinSavedTimer.current);
    pinSavedTimer.current = window.setTimeout(() => setPinSaved(false), 2000);
  }

  function pinFieldChange(setter: (value: string) => void) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value.replace(/\D/g, "").slice(0, 4));
      setPinMessage(null);
    };
  }

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
      window.clearTimeout(savedTimer.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The body grows with the wording while never dropping under twelve lines.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, loading]);

  async function handleSave() {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveFailed(false);
    const { error } = await supabase
      .from("daily_notes_settings")
      .update({
        email_subject: subject,
        email_template: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SETTINGS_ROW_ID);
    if (error) {
      setSaveFailed(true);
      setSaving(false);
      return;
    }
    setSavedSubject(subject);
    setSavedBody(body);
    setSaving(false);
    setJustSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 2000);
  }

  async function saveLabels(next: NavLabels, resetting: boolean) {
    if (labelsBusy) return;
    const tidy = tidyNavLabels(next);
    const problem = checkNavLabels(tidy);
    if (problem) {
      setLabelsMessage(problem.message);
      return;
    }
    setLabelsBusy(true);
    setLabelsMessage(null);
    const { error } = await supabase
      .from("daily_notes_settings")
      .update({ nav_labels: tidy, updated_at: new Date().toISOString() })
      .eq("id", SETTINGS_ROW_ID);
    setLabelsBusy(false);
    if (error) {
      setLabelsMessage("The names could not be saved. Please try again.");
      return;
    }
    setDraftLabels(tidy);
    // Straight away everywhere, with no refresh.
    onLabelsChange(tidy);
    if (!resetting) {
      setLabelsSaved(true);
      window.clearTimeout(labelsSavedTimer.current);
      labelsSavedTimer.current = window.setTimeout(() => setLabelsSaved(false), 2000);
    }
  }

  function handleResetLabels() {
    const sure = window.confirm(
      "Put every screen name back to the one the app came with? Any names you have set will be lost.",
    );
    if (!sure) return;
    void saveLabels(DEFAULT_NAV_LABELS, true);
  }

  function editTopic(index: number, value: string) {
    setTopicsMessage(null);
    setTopics((current) => current.map((topic, i) => (i === index ? value : topic)));
  }

  function addTopic() {
    setTopicsMessage(null);
    setTopics((current) => [...current, ""]);
  }

  function removeTopic(index: number) {
    setTopicsMessage(null);
    setTopics((current) => current.filter((_, i) => i !== index));
  }

  function moveTopic(index: number, delta: number) {
    setTopicsMessage(null);
    setTopics((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function handleTopicsSave() {
    if (topicsBusy) return;
    const tidy = tidyQuickEmailTopics(topics);
    setTopicsBusy(true);
    setTopicsMessage(null);
    const { error } = await supabase
      .from("daily_notes_settings")
      .update({ quick_email_topics: tidy, updated_at: new Date().toISOString() })
      .eq("id", SETTINGS_ROW_ID);
    setTopicsBusy(false);
    if (error) {
      setTopicsMessage("The topics could not be saved. Please try again.");
      return;
    }
    // Written as the tidy array, which may be empty; the fields and the dirty
    // check then show the effective list, the defaults when nothing is left.
    const effective = readQuickEmailTopics(tidy);
    setSavedTopics(effective);
    setTopics(effective);
    setTopicsSaved(true);
    window.clearTimeout(topicsSavedTimer.current);
    topicsSavedTimer.current = window.setTimeout(() => setTopicsSaved(false), 2000);
  }

  if (pinGate.state !== "unlocked") {
    return <LockGate heading="Settings" gate={pinGate} />;
  }

  return (
    <section
      className="settings-screen"
      onPointerDownCapture={pinGate.touch}
      onKeyDownCapture={pinGate.touch}
    >
      <div className="settings-card">
        <h2 className="section-heading">Email template</h2>
        <p className="settings-sub">
          This is the wording used for the emails drafted at 7:30 pm each night.
        </p>

        {loading ? (
          <p className="settings-message">Loading the template</p>
        ) : loadFailed ? (
          <p className="settings-message" role="alert">
            The template could not be loaded. Please try again.
          </p>
        ) : (
          <>
            <label className="field-label" htmlFor="settings-subject">
              Subject
            </label>
            <input
              id="settings-subject"
              className="text-field"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <label className="field-label" htmlFor="settings-body">
              Email body
            </label>
            <textarea
              id="settings-body"
              className="text-field text-area"
              rows={12}
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />

            <div className="placeholder-panel">
              <p className="placeholder-line">
                <span className="placeholder-token">{"{parent_first_name}"}</span> for the parent's
                first name
              </p>
              <p className="placeholder-line">
                <span className="placeholder-token">{"{student_name}"}</span> for the student's
                first name
              </p>
              <p className="placeholder-line">
                <span className="placeholder-token">{"{note}"}</span> for the note typed about that
                student
              </p>
            </div>
            <p className="settings-note">
              Anything in curly brackets is swapped for the real details when the email is drafted.
            </p>

            <button
              type="button"
              className="primary-button settings-save"
              disabled={saving || !dirty}
              onClick={handleSave}
            >
              {saving ? "Saving..." : justSaved ? "Saved" : "Save changes"}
            </button>
            {saveFailed ? (
              <p className="settings-message" role="alert">
                The changes could not be saved. Please try again.
              </p>
            ) : null}

            <h3 className="preview-heading">Preview</h3>
            <div className="preview-panel">
              <p className="preview-subject">{fillPlaceholders(subject)}</p>
              <p className="preview-body">{fillPlaceholders(body)}</p>
            </div>
          </>
        )}
      </div>

      <div className="settings-card">
        <h2 className="section-heading">Quick email topics</h2>
        <p className="settings-sub">
          These are the chips offered when a quick email is drafted from a parent row.
        </p>
        {loading ? (
          <p className="settings-message">Loading the topics</p>
        ) : loadFailed ? (
          <p className="settings-message" role="alert">
            The topics could not be loaded. Please try again.
          </p>
        ) : (
          <>
            <ul className="topics-editor">
              {topics.map((topic, index) => (
                <li key={index} className="topics-row">
                  <input
                    className="text-field topics-input"
                    type="text"
                    value={topic}
                    aria-label={`Topic ${index + 1}`}
                    placeholder="A topic to offer"
                    onChange={(event) => editTopic(index, event.target.value)}
                  />
                  <button
                    type="button"
                    className="topics-icon-button"
                    aria-label={`Move topic ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveTopic(index, -1)}
                  >
                    <ChevronUpIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="topics-icon-button"
                    aria-label={`Move topic ${index + 1} down`}
                    disabled={index === topics.length - 1}
                    onClick={() => moveTopic(index, 1)}
                  >
                    <ChevronDownIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="topics-icon-button topics-remove"
                    aria-label={`Remove topic ${index + 1}`}
                    onClick={() => removeTopic(index)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <button type="button" className="topics-add" onClick={addTopic}>
              Add a topic
            </button>

            {topicsMessage ? (
              <p className="settings-message" role="alert">
                {topicsMessage}
              </p>
            ) : null}

            <button
              type="button"
              className="primary-button settings-save"
              disabled={!topicsDirty || topicsBusy}
              onClick={handleTopicsSave}
            >
              {topicsBusy ? "Saving..." : topicsSaved ? "Saved" : "Save changes"}
            </button>
          </>
        )}
      </div>

      <div className="settings-card">
        <h2 className="section-heading">Screen names</h2>
        <p className="settings-sub">
          These are the names shown in the sidebar and along the bottom on a phone.
        </p>

        <p className="names-group-head">Section headings</p>
        {GROUP_KEYS.map((key) => (
          <div key={key}>
            <label className="field-label" htmlFor={`nav-group-${key}`}>
              {DEFAULT_NAV_LABELS.groups[key]}
            </label>
            <input
              id={`nav-group-${key}`}
              className="text-field"
              type="text"
              value={draftLabels.groups[key]}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) => {
                setLabelsMessage(null);
                setDraftLabels((current) => ({
                  ...current,
                  groups: { ...current.groups, [key]: event.target.value },
                }));
              }}
            />
          </div>
        ))}

        <p className="names-group-head">Screens</p>
        {SCREEN_KEYS.map((key) => (
          <div key={key}>
            {/* Labelled by what the screen is for, so the label does not
                change as the name is typed. */}
            <label className="field-label" htmlFor={`nav-screen-${key}`}>
              {SCREEN_FIELD_LABELS[key]}
            </label>
            <input
              id={`nav-screen-${key}`}
              className="text-field"
              type="text"
              value={draftLabels.screens[key]}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) => {
                setLabelsMessage(null);
                setDraftLabels((current) => ({
                  ...current,
                  screens: { ...current.screens, [key]: event.target.value },
                }));
              }}
            />
          </div>
        ))}

        {labelsMessage ? (
          <p className="settings-message" role="alert">
            {labelsMessage}
          </p>
        ) : null}

        <button
          type="button"
          className="primary-button settings-save"
          disabled={!labelsDirty || labelsBusy}
          onClick={() => void saveLabels(draftLabels, false)}
        >
          {labelsBusy ? "Saving..." : labelsSaved ? "Saved" : "Save changes"}
        </button>

        <button
          type="button"
          className="names-reset"
          disabled={labelsBusy}
          onClick={handleResetLabels}
        >
          Reset to the original names
        </button>
      </div>

      <div className="settings-card">
        <h2 className="section-heading">Manager PIN</h2>
        <p className="settings-sub">
          This unlocks the Manager screen. It locks itself again after fifteen minutes.
        </p>
        {loading ? (
          <p className="settings-message">Loading</p>
        ) : loadFailed ? (
          <p className="settings-message" role="alert">
            The PIN settings could not be loaded. Please try again.
          </p>
        ) : (
          <>
            {pinGate.storedHash ? (
              <>
                <label className="field-label" htmlFor="pin-current">
                  Current PIN
                </label>
                <input
                  id="pin-current"
                  className="text-field pin-field"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={currentPin}
                  onChange={pinFieldChange(setCurrentPin)}
                />
              </>
            ) : null}
            <label className="field-label" htmlFor="pin-new">
              New PIN
            </label>
            <input
              id="pin-new"
              className="text-field pin-field"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={newPin}
              onChange={pinFieldChange(setNewPin)}
            />
            <label className="field-label" htmlFor="pin-confirm">
              Confirm new PIN
            </label>
            <input
              id="pin-confirm"
              className="text-field pin-field"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={confirmPin}
              onChange={pinFieldChange(setConfirmPin)}
            />
            <button
              type="button"
              className="primary-button settings-save"
              disabled={pinBusy}
              onClick={handlePinSave}
            >
              {pinBusy
                ? "Saving..."
                : pinSaved
                  ? "Saved"
                  : pinGate.storedHash
                    ? "Change PIN"
                    : "Set PIN"}
            </button>
            {pinMessage ? (
              <p className="settings-message" role="alert">
                {pinMessage}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
