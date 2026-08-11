import { useState } from "react";
import { copyText } from "../lib/clipboard";
import { supabase } from "../lib/supabase";
import type { MessageTemplate } from "../lib/templates";
import { TrashIcon } from "./Icons";

type TemplateManagerPanelProps = {
  mode: "sms" | "email";
  templates: MessageTemplate[];
  onTemplatesChange: (next: MessageTemplate[]) => void;
  onClose: () => void;
};

const TABLE = { sms: "sms_templates", email: "email_templates" } as const;
const COLUMNS = {
  sms: "id, template_name, body",
  email: "id, template_name, subject, body",
} as const;

// Manage the saved messages the row panels offer. Inline, never a dialog.
// Create and delete mirror the old app; editing in place is new, because the
// old managers could only add and remove.
export function TemplateManagerPanel({
  mode,
  templates,
  onTemplatesChange,
  onClose,
}: TemplateManagerPanelProps) {
  const withSubject = mode === "email";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const label = withSubject ? "email" : "SMS";
  const ready = Boolean(name.trim() && body.trim() && (!withSubject || subject.trim()));

  function resetForm() {
    setEditingId(null);
    setName("");
    setSubject("");
    setBody("");
    setMessage(null);
  }

  async function refresh(): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE[mode])
      .select(COLUMNS[mode])
      .order("template_name", { ascending: true });
    if (error) return false;
    onTemplatesChange((data ?? []) as unknown as MessageTemplate[]);
    return true;
  }

  async function handleSave() {
    if (busy) return;
    if (!ready) {
      setMessage(
        withSubject
          ? "Give the template a name, a subject and a body."
          : "Give the template a name and a body.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    const values: { template_name: string; body: string; subject?: string } = {
      template_name: name.trim(),
      body: body.trim(),
    };
    if (withSubject) values.subject = subject.trim();

    const { error } = editingId
      ? await supabase.from(TABLE[mode]).update(values).eq("id", editingId)
      : await supabase.from(TABLE[mode]).insert(values);
    if (error) {
      setBusy(false);
      setMessage(
        editingId
          ? "The template could not be saved. Please try again."
          : "The template could not be added. Please try again.",
      );
      return;
    }
    const refreshed = await refresh();
    setBusy(false);
    if (!refreshed) {
      setMessage("Saved, but the list could not be reloaded. Reopen this panel to see it.");
      return;
    }
    resetForm();
  }

  function handleEdit(template: MessageTemplate) {
    setEditingId(String(template.id));
    setName(template.template_name ?? "");
    setSubject(template.subject ?? "");
    setBody(template.body ?? "");
    setConfirmId(null);
    setMessage(null);
  }

  async function handleDelete(template: MessageTemplate) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from(TABLE[mode]).delete().eq("id", template.id);
    if (error) {
      setBusy(false);
      setMessage("The template could not be deleted. Please try again.");
      return;
    }
    await refresh();
    setBusy(false);
    setConfirmId(null);
    if (editingId === String(template.id)) resetForm();
  }

  async function handleCopy(template: MessageTemplate) {
    const text = withSubject
      ? `${template.subject ?? ""}\n\n${template.body ?? ""}`.trim()
      : (template.body ?? "");
    const ok = await copyText(text);
    if (!ok) {
      setMessage("The template could not be copied.");
      return;
    }
    setCopiedId(String(template.id));
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="roster-panel help-panel">
      <p className="roster-panel-title">
        {withSubject ? "Email" : "SMS"} templates
        <span className="template-count">{templates.length} saved</span>
      </p>

      <p className="help-note">
        Use {"{{parent_name}}"} and {"{{student_name}}"}
        {withSubject ? " in the subject or the body" : ""}. Both render as first names only, so
        Grace Chen becomes Grace.
      </p>

      <div className="template-manager-form">
        <p className="help-example-label">
          {editingId ? `Edit ${label} template` : `New ${label} template`}
        </p>
        <label className="field-label" htmlFor="template-name">
          Name
        </label>
        <input
          id="template-name"
          className="text-field log-input"
          type="text"
          value={name}
          placeholder="Catch up nudge"
          onChange={(event) => {
            setName(event.target.value);
            setMessage(null);
          }}
        />
        {withSubject ? (
          <>
            <label className="field-label" htmlFor="template-subject">
              Subject
            </label>
            <input
              id="template-subject"
              className="text-field log-input"
              type="text"
              value={subject}
              placeholder="A quick catch up about {{student_name}}"
              onChange={(event) => {
                setSubject(event.target.value);
                setMessage(null);
              }}
            />
          </>
        ) : null}
        <label className="field-label" htmlFor="template-body">
          Body
        </label>
        <textarea
          id="template-body"
          className="text-field template-textarea"
          rows={withSubject ? 6 : 3}
          value={body}
          placeholder="Hi {{parent_name}}, just checking in about {{student_name}}."
          onChange={(event) => {
            setBody(event.target.value);
            setMessage(null);
          }}
        />
        {message ? (
          <p className="roster-panel-message" role="alert">
            {message}
          </p>
        ) : null}
        <div className="roster-panel-actions">
          {editingId ? (
            <button type="button" className="row-button" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button roster-panel-save"
            disabled={busy || !ready}
            onClick={handleSave}
          >
            {busy ? "Saving..." : editingId ? "Save changes" : "Add template"}
          </button>
        </div>
      </div>

      <p className="help-example-label">Saved templates</p>
      {templates.length === 0 ? (
        <p className="roster-panel-text">No {label} templates yet. Add one above.</p>
      ) : (
        <ul className="template-list">
          {templates.map((template) => (
            <li key={template.id} className="template-item">
              <div className="template-item-head">
                <p className="template-item-name">{template.template_name ?? "Untitled"}</p>
                <div className="template-item-actions">
                  <button type="button" className="row-button" onClick={() => handleCopy(template)}>
                    {copiedId === String(template.id) ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className="row-button" onClick={() => handleEdit(template)}>
                    Edit
                  </button>
                  {confirmId === String(template.id) ? (
                    <>
                      <button
                        type="button"
                        className="primary-button roster-panel-save button-danger"
                        disabled={busy}
                        onClick={() => handleDelete(template)}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="row-button"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="icon-button icon-button-danger"
                      aria-label={`Delete the template ${template.template_name ?? "Untitled"}`}
                      title="Delete template"
                      onClick={() => {
                        setConfirmId(String(template.id));
                        setMessage(null);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
              {withSubject && template.subject ? (
                <p className="template-item-subject">{template.subject}</p>
              ) : null}
              <p className="template-item-body">{template.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
