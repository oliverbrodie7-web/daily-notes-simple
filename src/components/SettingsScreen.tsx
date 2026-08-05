import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { hashPin, isValidPin } from "../lib/pin";
import { supabase } from "../lib/supabase";

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
};

export function SettingsScreen({ onDirtyChange }: SettingsScreenProps) {
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

  const [pinHash, setPinHash] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const pinSavedTimer = useRef<number | undefined>(undefined);

  const dirty = !loading && !loadFailed && (subject !== savedSubject || body !== savedBody);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes_settings")
      .select("email_subject, email_template, manager_pin_hash")
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
        setPinHash(((data.manager_pin_hash as string | null) ?? "").trim() || null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => window.clearTimeout(pinSavedTimer.current), []);

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
    if (pinHash) {
      const currentHash = await hashPin(currentPin);
      if (currentHash !== pinHash) {
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
    setPinHash(nextHash);
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

  return (
    <section className="settings-screen">
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
            {pinHash ? (
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
              {pinBusy ? "Saving..." : pinSaved ? "Saved" : pinHash ? "Change PIN" : "Set PIN"}
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
