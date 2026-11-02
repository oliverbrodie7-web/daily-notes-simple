import { useState } from "react";
import {
  CONTACT_FIRST_CLEAR,
  CONTACT_FIRST_TITLE,
  seeAllLabel,
  type ContactFirstFamily,
} from "../lib/contactFirst";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons";

// The card under the coverage meter. It shows only while there is at least one
// family to contact; when there is none it shows the all caught up line
// instead. Draft email opens the quick email panel, so the card is self
// contained. The list collapses behind the header, which keeps the title and
// the count visible either way, and the collapsed state is remembered in
// localStorage so it stays as the user left it.

const COLLAPSE_KEY = "touch-points-contact-first-collapsed";

// Read and write the collapsed state, wrapped so a blocked or missing storage
// (private browsing, for example) never breaks the card: it simply opens
// expanded and does not remember.
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage unavailable; the card still works, it just will not remember.
  }
}

type ContactFirstCardProps = {
  families: ContactFirstFamily[];
  // Every family that needs a touch point, for the header and footer count.
  redTotal: number;
  onDraft: (id: string) => void;
  onSeeAll: () => void;
};

export function ContactFirstCard({ families, redTotal, onDraft, onSeeAll }: ContactFirstCardProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (families.length === 0) {
    return (
      <div className="contact-first contact-first-clear" role="status">
        <p className="contact-first-clear-text">{CONTACT_FIRST_CLEAR}</p>
      </div>
    );
  }

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  }

  return (
    <section className="contact-first" aria-label={CONTACT_FIRST_TITLE}>
      <h3 className="contact-first-title">
        <button
          type="button"
          className="contact-first-header"
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          <span className="contact-first-title-text">{CONTACT_FIRST_TITLE}</span>
          <span className="contact-first-count">{redTotal}</span>
          {collapsed ? (
            <ChevronDownIcon className="contact-first-chevron" size={18} />
          ) : (
            <ChevronUpIcon className="contact-first-chevron" size={18} />
          )}
        </button>
      </h3>
      {collapsed ? null : (
        <>
          <ul className="contact-first-list">
            {families.map((family) => (
              <li key={family.id} className="contact-first-row">
                <div className="contact-first-who">
                  <p className="contact-first-name">{family.studentName}</p>
                  <p className="contact-first-parent">
                    <span className="contact-first-parent-name">
                      {family.parentName || "No parent name"}
                    </span>
                    {family.parentPhone ? (
                      <span className="contact-first-phone">{family.parentPhone}</span>
                    ) : null}
                  </p>
                  <p className="contact-first-reason">{family.reason}</p>
                </div>
                <button
                  type="button"
                  className="row-button contact-first-draft"
                  onClick={() => onDraft(family.id)}
                >
                  Draft email
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="contact-first-footer" onClick={onSeeAll}>
            {seeAllLabel(redTotal)}
          </button>
        </>
      )}
    </section>
  );
}
