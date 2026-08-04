import { useEffect, useRef, useState } from "react";
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
  currentEmail: string;
  onOwnNameChange: (name: string) => void;
};

type Person = {
  email: string;
  display_name: string;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "en", { sensitivity: "base" }),
  );
}

export function SettingsScreen({
  onDirtyChange,
  currentEmail,
  onOwnNameChange,
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

  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleLoadFailed, setPeopleLoadFailed] = useState(false);
  const [peopleMessage, setPeopleMessage] = useState<string | null>(null);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");

  const dirty = !loading && !loadFailed && (subject !== savedSubject || body !== savedBody);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("daily_notes_settings")
      .select("email_subject, email_template")
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
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("app_users")
      .select("email, display_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setPeopleLoadFailed(true);
          setPeople([]);
          return;
        }
        setPeople(sortPeople((data ?? []) as Person[]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePersonSave(person: Person) {
    const name = editingName.trim();
    if (!name) {
      setPeopleMessage("Enter a name before saving.");
      return;
    }
    if (peopleBusy) return;
    setPeopleBusy(true);
    setPeopleMessage(null);
    const { error } = await supabase
      .from("app_users")
      .update({ display_name: name })
      .eq("email", person.email);
    setPeopleBusy(false);
    if (error) {
      setPeopleMessage("The change could not be saved. Please try again.");
      return;
    }
    setPeople((current) =>
      sortPeople(
        (current ?? []).map((item) =>
          item.email === person.email ? { ...item, display_name: name } : item,
        ),
      ),
    );
    if (person.email === currentEmail) onOwnNameChange(name);
    setEditingEmail(null);
    setEditingName("");
  }

  async function handlePersonRemove(person: Person) {
    if (peopleBusy) return;
    const sure = window.confirm(`Remove ${person.display_name} from the list?`);
    if (!sure) return;
    setPeopleBusy(true);
    setPeopleMessage(null);
    const { error } = await supabase.from("app_users").delete().eq("email", person.email);
    setPeopleBusy(false);
    if (error) {
      setPeopleMessage("The change could not be saved. Please try again.");
      return;
    }
    setPeople((current) => (current ?? []).filter((item) => item.email !== person.email));
  }

  async function handlePersonAdd() {
    if (peopleBusy) return;
    const email = addEmail.trim().toLowerCase();
    const name = addName.trim();
    if (!email || !name) {
      setPeopleMessage("Enter both an email and a name.");
      return;
    }
    if (!EMAIL_SHAPE.test(email)) {
      setPeopleMessage("That does not look like an email address.");
      return;
    }
    if ((people ?? []).some((person) => person.email.toLowerCase() === email)) {
      setPeopleMessage("That email is already in the list.");
      return;
    }
    setPeopleBusy(true);
    setPeopleMessage(null);
    const { error } = await supabase.from("app_users").insert({ email, display_name: name });
    setPeopleBusy(false);
    if (error) {
      setPeopleMessage("The change could not be saved. Please try again.");
      return;
    }
    setPeople((current) => sortPeople([...(current ?? []), { email, display_name: name }]));
    setAddEmail("");
    setAddName("");
  }

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
        <h2 className="section-heading">People</h2>
        <p className="settings-sub">
          These are the names shown on each note. Adding someone here does not create their login.
        </p>

        {people === null ? (
          <p className="settings-message">Loading people</p>
        ) : peopleLoadFailed ? (
          <p className="settings-message" role="alert">
            The people list could not be loaded. Please try again.
          </p>
        ) : (
          <>
            <ul className="people-list">
              {people.map((person) => {
                const editing = editingEmail === person.email;
                return (
                  <li key={person.email} className="people-row">
                    <div className="people-details">
                      {editing ? (
                        <input
                          className="text-field people-edit-field"
                          type="text"
                          value={editingName}
                          aria-label={`Name for ${person.email}`}
                          onChange={(event) => {
                            setEditingName(event.target.value);
                            setPeopleMessage(null);
                          }}
                        />
                      ) : (
                        <span className="people-name">{person.display_name}</span>
                      )}
                      <span className="people-email">{person.email}</span>
                    </div>
                    <div className="people-actions">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="row-action row-action-accent"
                            disabled={peopleBusy}
                            onClick={() => handlePersonSave(person)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => {
                              setEditingEmail(null);
                              setEditingName("");
                              setPeopleMessage(null);
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="row-action row-action-accent"
                            onClick={() => {
                              setEditingEmail(person.email);
                              setEditingName(person.display_name);
                              setPeopleMessage(null);
                            }}
                          >
                            Edit
                          </button>
                          {person.email !== currentEmail ? (
                            <button
                              type="button"
                              className="row-action"
                              disabled={peopleBusy}
                              onClick={() => handlePersonRemove(person)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="people-add">
              <label className="field-label" htmlFor="person-email">
                Email
              </label>
              <input
                id="person-email"
                className="text-field"
                type="email"
                value={addEmail}
                onChange={(event) => {
                  setAddEmail(event.target.value);
                  setPeopleMessage(null);
                }}
              />
              <label className="field-label" htmlFor="person-name">
                Name
              </label>
              <input
                id="person-name"
                className="text-field"
                type="text"
                value={addName}
                onChange={(event) => {
                  setAddName(event.target.value);
                  setPeopleMessage(null);
                }}
              />
              <button
                type="button"
                className="primary-button people-add-button"
                disabled={peopleBusy}
                onClick={handlePersonAdd}
              >
                Add person
              </button>
            </div>
            {peopleMessage ? (
              <p className="settings-message" role="alert">
                {peopleMessage}
              </p>
            ) : null}
            <p className="settings-note">
              To let this person sign in, add them as a user in the database as well.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
