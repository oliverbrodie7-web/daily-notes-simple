import { useState } from "react";
import { copyText } from "../lib/clipboard";
import {
  firstName,
  greetingName,
  mailtoHref,
  populateTemplate,
  smsHref,
  type MessageTemplate,
} from "../lib/templates";

type TemplatePanelProps = {
  mode: "sms" | "email";
  studentName: string;
  parentName: string | null;
  target: string;
  templates: MessageTemplate[];
  onClose: () => void;
};

// An inline panel, never a dialog. Pick a saved template, read exactly what
// will be sent, then hand it to Messages or the mail app already filled in.
// Every placeholder is filled with first names only.
export function TemplatePanel({
  mode,
  studentName,
  parentName,
  target,
  templates,
  onClose,
}: TemplatePanelProps) {
  const [selectedId, setSelectedId] = useState<string>(() =>
    templates.length === 1 ? String(templates[0]?.id ?? "") : "",
  );
  const [copied, setCopied] = useState(false);

  const parentFirst = greetingName(parentName);
  const studentFirst = firstName(studentName) || studentName;
  const selected = templates.find((entry) => String(entry.id) === selectedId) ?? null;

  const body = selected ? populateTemplate(selected.body, parentFirst, studentFirst) : "";
  const subject =
    mode === "email" && selected
      ? populateTemplate(selected.subject, parentFirst, studentFirst)
      : "";

  const href = mode === "sms" ? smsHref(target, body) : mailtoHref(target, subject, body);

  async function handleCopy() {
    const text = mode === "email" && subject ? `${subject}\n\n${body}` : body;
    const ok = await copyText(text);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="roster-panel">
      <p className="roster-panel-title">
        {mode === "sms" ? "Send an SMS to" : "Email"} {parentFirst} about {studentFirst}
      </p>
      {templates.length === 0 ? (
        <p className="roster-panel-text">
          No {mode === "sms" ? "SMS" : "email"} templates saved yet. You can still open a blank
          message.
        </p>
      ) : (
        <div className="template-chips">
          {templates.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`template-chip${
                String(entry.id) === selectedId ? " template-chip-active" : ""
              }`}
              aria-pressed={String(entry.id) === selectedId}
              onClick={() =>
                setSelectedId((current) => (current === String(entry.id) ? "" : String(entry.id)))
              }
            >
              {entry.template_name ?? "Untitled"}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="template-preview">
          {mode === "email" ? <p className="template-subject">{subject}</p> : null}
          <p className="template-body">{body}</p>
        </div>
      ) : templates.length > 0 ? (
        <p className="roster-panel-text">Choose a template to see the message.</p>
      ) : null}

      <p className="template-target">
        {mode === "sms" ? "To" : "To"} {target}
      </p>

      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Close
        </button>
        <button type="button" className="row-button" disabled={!body} onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <a className="primary-button roster-panel-save template-open" href={href}>
          {mode === "sms" ? "Open Messages" : "Open email"}
        </a>
      </div>
    </div>
  );
}
