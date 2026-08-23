import { useEffect, useMemo, useRef, useState } from "react";
import type { PinGate } from "../hooks/usePinGate";
import {
  DETAIL_NOTE,
  PLACEHOLDER_NOTES,
  SMS_OVER_LIMIT_NOTE,
  TEMPLATE_COLUMNS,
  draftOf,
  fillPreview,
  missingPlaceholderWarning,
  resetQuestion,
  resetTarget,
  sameDraft,
  smsCountLabel,
  smsOverLimit,
  updatePayload,
  type ReengagementTemplate,
  type TemplateDraft,
} from "../lib/reengagement";
import { supabase } from "../lib/supabase";
import { LockGate } from "./LockGate";
import { ScreenSubtitle } from "./ScreenBar";

type TemplatesScreenProps = {
  onDirtyChange: (dirty: boolean) => void;
  pinGate: PinGate;
};

const SAVED_FOR_MS = 2000;

// The email box starts at twelve lines and grows with what is in it.
const MIN_EMAIL_ROWS = 12;

export function TemplatesScreen({ onDirtyChange, pinGate }: TemplatesScreenProps) {
  const unlocked = pinGate.state === "unlocked";

  const [rows, setRows] = useState<ReengagementTemplate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // The wording each card opened on, and what it holds now. Keyed by the
  // template's key, so one card can never reach another.
  const [saved, setSaved] = useState<Record<string, TemplateDraft>>({});
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    supabase
      .from("reengagement_templates")
      .select(TEMPLATE_COLUMNS)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLoadFailed(true);
          setRows([]);
          return;
        }
        const loaded = data as ReengagementTemplate[];
        const opened: Record<string, TemplateDraft> = {};
        for (const row of loaded) opened[row.key] = draftOf(row);
        setRows(loaded);
        setSaved(opened);
        setDrafts(opened);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const dirtyKeys = useMemo(() => {
    return Object.keys(drafts).filter((key) => {
      const was = saved[key];
      const now = drafts[key];
      return was && now ? !sameDraft(was, now) : false;
    });
  }, [drafts, saved]);

  useEffect(() => {
    onDirtyChange(dirtyKeys.length > 0);
  }, [dirtyKeys, onDirtyChange]);

  function edit(key: string, field: keyof TemplateDraft, value: string) {
    setMessages((current) => ({ ...current, [key]: "" }));
    setDrafts((current) => {
      const card = current[key];
      if (!card) return current;
      return { ...current, [key]: { ...card, [field]: value } };
    });
  }

  async function handleSave(template: ReengagementTemplate) {
    const key = template.key;
    const draft = drafts[key];
    if (!draft || busyKey) return;
    setBusyKey(key);
    setMessages((current) => ({ ...current, [key]: "" }));
    // Only the three editable columns leave here, whatever else the row has.
    const { error } = await supabase
      .from("reengagement_templates")
      .update(updatePayload(draft, new Date().toISOString()))
      .eq("id", template.id);
    setBusyKey(null);
    if (error) {
      // The typed wording stays exactly where it is, so nothing is lost.
      setMessages((current) => ({
        ...current,
        [key]: "The changes could not be saved. Please try again.",
      }));
      return;
    }
    setSaved((current) => ({ ...current, [key]: draft }));
    setJustSaved(key);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(null), SAVED_FOR_MS);
  }

  function handleReset(template: ReengagementTemplate) {
    const key = template.key;
    const opened = saved[key];
    if (!opened) return;
    const target = resetTarget(key, opened);
    const sure = window.confirm(resetQuestion(template.name, target.source));
    if (!sure) return;
    // Only this card.
    setDrafts((current) => ({ ...current, [key]: target.draft }));
    setMessages((current) => ({ ...current, [key]: "" }));
  }

  if (!unlocked) {
    return <LockGate heading="Templates" gate={pinGate} />;
  }

  const loading = rows === null;
  const count = rows?.length ?? 0;

  return (
    <section
      className="templates-screen"
      onPointerDownCapture={pinGate.touch}
      onKeyDownCapture={pinGate.touch}
    >
      <ScreenSubtitle>
        {loading
          ? null
          : `${count} ${count === 1 ? "template" : "templates"}${
              dirtyKeys.length > 0 ? `, ${dirtyKeys.length} unsaved` : ""
            }`}
      </ScreenSubtitle>

      {loading ? (
        <p className="settings-message">Loading the templates</p>
      ) : loadFailed ? (
        <p className="settings-message" role="alert">
          The templates could not be loaded. Please try again.
        </p>
      ) : (
        (rows ?? []).map((template) => {
          const key = template.key;
          const draft = drafts[key];
          if (!draft) return null;
          const dirty = dirtyKeys.includes(key);
          const busy = busyKey === key;
          const message = messages[key];
          const warning = missingPlaceholderWarning(draft.email_body);
          const over = smsOverLimit(draft.sms_body);
          const showing = previewing[key] === true;

          return (
            <div className="settings-card template-card" key={key}>
              <h2 className="section-heading">{template.name}</h2>
              {template.when_to_use ? <p className="settings-sub">{template.when_to_use}</p> : null}

              <label className="field-label" htmlFor={`tpl-subject-${key}`}>
                Subject
              </label>
              <input
                id={`tpl-subject-${key}`}
                className="text-field"
                type="text"
                value={draft.email_subject}
                onChange={(event) => edit(key, "email_subject", event.target.value)}
              />

              <label className="field-label" htmlFor={`tpl-email-${key}`}>
                Email
              </label>
              <textarea
                id={`tpl-email-${key}`}
                className="text-field template-email"
                rows={Math.max(MIN_EMAIL_ROWS, draft.email_body.split("\n").length + 1)}
                value={draft.email_body}
                onChange={(event) => edit(key, "email_body", event.target.value)}
              />
              {warning ? (
                <p className="template-warning" role="status">
                  {warning}
                </p>
              ) : null}

              <label className="field-label" htmlFor={`tpl-sms-${key}`}>
                SMS
              </label>
              <textarea
                id={`tpl-sms-${key}`}
                className="text-field template-sms"
                rows={3}
                value={draft.sms_body}
                onChange={(event) => edit(key, "sms_body", event.target.value)}
              />
              <p className={`template-count${over ? " is-over" : ""}`}>
                {smsCountLabel(draft.sms_body)}
                {over ? <span className="template-count-note">{SMS_OVER_LIMIT_NOTE}</span> : null}
              </p>

              <div className="template-placeholders">
                <ul className="template-placeholder-list">
                  {[
                    ...PLACEHOLDER_NOTES,
                    ...(template.needs_detail === true ? [DETAIL_NOTE] : []),
                  ].map((entry) => (
                    <li key={entry.token}>
                      <code className="template-token">{entry.token}</code> {entry.note}
                    </li>
                  ))}
                </ul>
                <p className="template-placeholder-note">
                  Anything in curly brackets is swapped for the real details when the email is
                  drafted.
                </p>
              </div>

              {message ? (
                <p className="settings-message" role="alert">
                  {message}
                </p>
              ) : null}

              <button
                type="button"
                className="primary-button settings-save"
                disabled={!dirty || busy}
                onClick={() => void handleSave(template)}
              >
                {busy ? "Saving..." : justSaved === key ? "Saved" : "Save changes"}
              </button>

              <button
                type="button"
                className="template-preview-button"
                aria-expanded={showing}
                onClick={() => setPreviewing((current) => ({ ...current, [key]: !showing }))}
              >
                {showing ? "Hide preview" : "Preview"}
              </button>

              {showing ? (
                <div className="template-preview">
                  <p className="template-preview-subject">{fillPreview(draft.email_subject)}</p>
                  <p className="template-preview-body">{fillPreview(draft.email_body)}</p>
                  <p className="template-preview-label">SMS</p>
                  <p className="template-preview-sms">{fillPreview(draft.sms_body)}</p>
                </div>
              ) : null}

              <button
                type="button"
                className="names-reset template-reset"
                disabled={busy}
                onClick={() => handleReset(template)}
              >
                Reset this template
              </button>
            </div>
          );
        })
      )}
    </section>
  );
}
