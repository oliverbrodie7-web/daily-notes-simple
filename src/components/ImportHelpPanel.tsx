import { useState } from "react";

type HelpTab = "bulk" | "single";

// The original screenshot lives only in the old app's asset host, so it is
// not in this repo. Drop the PNG into public/help/ and set this to
// "/help/timetable-extract-emails.png" and the figure below renders it,
// already sized to the panel.
const SCREENSHOT_SRC: string | null = "/help/timetable-extract-emails.png";
const SCREENSHOT_ALT =
  "Extract Email and Addresses tab in TimeTable Reports with correct settings configured and arrow pointing to Save Addresses to CSV button";

const ENROLMENT_FORMAT =
  "new enrolment - Parent: [Parent Name], Email: [Parent Email], Phone: [Parent Phone], Student: [Student Name], First lesson: [DD/MM/YYYY]";

const ENROLMENT_EXAMPLE =
  "new enrolment - Parent: Kerry Warren, Email: kerry@gmail.com, Phone: 0401 959 934, Student: Harriet Warren, First lesson: 10/06/2026";

type ImportHelpPanelProps = {
  onClose: () => void;
};

// An inline panel, never a dialog, matching the tracker's other panels. The
// wording is carried over from the old app unchanged.
export function ImportHelpPanel({ onClose }: ImportHelpPanelProps) {
  const [tab, setTab] = useState<HelpTab>("bulk");

  return (
    <div className="roster-panel help-panel">
      <p className="roster-panel-title">How to import students</p>

      <div className="template-chips" role="tablist" aria-label="Import method">
        <button
          type="button"
          role="tab"
          id="help-tab-bulk"
          aria-selected={tab === "bulk"}
          aria-controls="help-panel-bulk"
          className={`template-chip${tab === "bulk" ? " template-chip-active" : ""}`}
          onClick={() => setTab("bulk")}
        >
          Bulk import
        </button>
        <button
          type="button"
          role="tab"
          id="help-tab-single"
          aria-selected={tab === "single"}
          aria-controls="help-panel-single"
          className={`template-chip${tab === "single" ? " template-chip-active" : ""}`}
          onClick={() => setTab("single")}
        >
          Single student
        </button>
      </div>

      {tab === "bulk" ? (
        <div id="help-panel-bulk" role="tabpanel" aria-labelledby="help-tab-bulk">
          <p className="help-note">
            The term roster import needs the database security fix to be live and verified first.
          </p>

          <div className="help-step">
            <span className="help-step-number" aria-hidden="true">
              1
            </span>
            <div className="help-step-body">
              <h3 className="help-step-title">Export the CSV from TimeTable</h3>
              <ol className="help-list">
                <li>
                  Open <strong>TimeTable Reports</strong>
                </li>
                <li>
                  Click the <strong>"Extract Email &amp; Addresses"</strong> tab
                </li>
                <li>
                  Make sure these settings are correct:
                  <ul className="help-sublist">
                    <li>
                      Enrolled in: <strong>All Subjects, current Term and Year</strong>
                    </li>
                    <li>
                      Family Filter: <strong>Both active and inactive</strong>
                    </li>
                    <li>
                      Tick <strong>"Remove Duplicate addresses"</strong>
                    </li>
                    <li>
                      Tick <strong>"Remove families with 'no email' ticked"</strong>
                    </li>
                  </ul>
                </li>
                <li>
                  Click <strong>"Save Addresses to CSV"</strong> and save the file to your device
                </li>
              </ol>

              <figure className="help-figure">
                {SCREENSHOT_SRC ? (
                  <img className="help-screenshot" src={SCREENSHOT_SRC} alt={SCREENSHOT_ALT} />
                ) : (
                  <div className="help-screenshot-missing">
                    <p className="help-missing-title">Screenshot missing</p>
                    <p className="help-missing-text">
                      The original timetable-extract-emails.png was never stored in the old repo,
                      only a link to it. Save that screenshot to public/help/ in this repo to
                      restore it here.
                    </p>
                  </div>
                )}
                <figcaption className="help-caption">
                  Extract Email &amp; Addresses tab in TimeTable Reports
                </figcaption>
              </figure>
            </div>
          </div>

          <div className="help-step">
            <span className="help-step-number" aria-hidden="true">
              2
            </span>
            <div className="help-step-body">
              <h3 className="help-step-title">Upload to Claude</h3>
              <ol className="help-list">
                <li>
                  Open a chat with <strong>Claude (Janice)</strong> using the sidebar helper
                </li>
                <li>
                  <strong>Attach</strong> the CSV file you just saved
                </li>
                <li>
                  Type: <code className="help-code-inline">import students</code>
                </li>
                <li>
                  Claude will run the import automatically and give you a summary of new students
                  added and existing students updated
                </li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div id="help-panel-single" role="tabpanel" aria-labelledby="help-tab-single">
          <div className="help-step">
            <span className="help-step-number" aria-hidden="true">
              1
            </span>
            <div className="help-step-body">
              <h3 className="help-step-title">Send the new enrolment message to Claude</h3>
              <p className="help-text">
                Open a chat with <strong>Claude (Janice)</strong> and paste the student's details in
                this format:
              </p>
              <pre className="help-code">{ENROLMENT_FORMAT}</pre>
              <p className="help-example-label">Example</p>
              <pre className="help-code">{ENROLMENT_EXAMPLE}</pre>
            </div>
          </div>

          <div className="help-step">
            <span className="help-step-number" aria-hidden="true">
              2
            </span>
            <div className="help-step-body">
              <h3 className="help-step-title">Claude will handle the rest</h3>
              <ol className="help-list">
                <li>Add the student to the Parent Catch-Up Tracker</li>
                <li>Create a welcome email draft in Gmail</li>
                <li>Create a direct debit details email draft in Gmail</li>
                <li>Set a calendar reminder to follow up 14 days after the first lesson</li>
                <li>Create a first-lesson follow-up email draft in Gmail</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="roster-panel-actions">
        <button type="button" className="row-button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
