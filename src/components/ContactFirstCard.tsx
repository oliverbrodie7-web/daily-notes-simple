import {
  CONTACT_FIRST_CLEAR,
  CONTACT_FIRST_TITLE,
  seeAllLabel,
  type ContactFirstFamily,
} from "../lib/contactFirst";

// The card under the coverage meter. No hooks of its own, so each state can
// be rendered and read on its own. It shows only while there is at least one
// family to contact; when there is none it shows the all caught up line
// instead. The Log action is the screen's existing one, handed down.

type ContactFirstCardProps = {
  families: ContactFirstFamily[];
  // Every family that needs a touch point, for the footer count.
  redTotal: number;
  onLog: (id: string) => void;
  onSeeAll: () => void;
};

export function ContactFirstCard({ families, redTotal, onLog, onSeeAll }: ContactFirstCardProps) {
  if (families.length === 0) {
    return (
      <div className="contact-first contact-first-clear" role="status">
        <p className="contact-first-clear-text">{CONTACT_FIRST_CLEAR}</p>
      </div>
    );
  }

  return (
    <section className="contact-first" aria-label={CONTACT_FIRST_TITLE}>
      <h3 className="contact-first-title">{CONTACT_FIRST_TITLE}</h3>
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
              className="row-button contact-first-log"
              onClick={() => onLog(family.id)}
            >
              Log contact
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="contact-first-footer" onClick={onSeeAll}>
        {seeAllLabel(redTotal)}
      </button>
    </section>
  );
}
