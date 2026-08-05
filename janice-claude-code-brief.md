# JANICE - CONTEXT AND INTENT BRIEF FOR A FULL REVAMP

## CURRENT MISSION (read this first)
The active project is NOT a whole-app revamp. It is a feature migration: the Parent Catch-Up Tracker moves out of Janice and into the EXISTING Touch Points app (repo: oliverbrodie7-web/daily-notes-simple, a Lovable-origin Vite + TypeScript + shadcn student-notes app), restyled to match Touch Points' look, on the same shared Supabase database. The companion document janice-tracker-extraction-roadmap.md (v2, Touch Points edition) is the delivery plan; this brief is the context underneath it. Sections 3, 4, 6 and 10 here matter most for the extraction: the schema, the P2 rules, the design language, and the landmines. Janice itself keeps To Do, Assessments and Ask Claude, and loses the tracker at cutover.

## How to use this document
You (Claude Code) have the repository. This document is the half the repository cannot give you: the purpose behind each feature, the business rules that live in people's heads rather than in comments, the landmines that have broken this app before, and where it is all heading. Read the code for structure; read this for intent. When the two disagree, the code is the current truth and this is the design intent, so surface the gap rather than silently picking one.

This brief was written by Claude (chat), who has acted as technical lead and product partner on Janice but has never seen the source code. Every statement here is behavioural or comes from a live database probe, never from reading the repo. So trust it for what Janice does and why, and verify anything about how the code is structured against the actual files.

Author of the app: Ollie, director of NumberWorks'nWords Miranda, a maths and English tutoring centre in Sydney. Not a professional developer. Builds carefully, values plain explanation, and gets anxious about breaking working things. The revamp should make the codebase easier for a non-specialist to reason about, not more clever.

---

## 1. What Janice is, in one paragraph
A single-user business operations app that runs a tutoring centre from an iPad (installed as a PWA). It combines a Gmail-fed to-do list, a parent-contact tracker for the whole student roster, an assessments tracker, and a set of Claude "skills" that automate writing tasks (parent emails, onboarding, imports). Behind it sits a Supabase database and a Google Apps Script project running scheduled agents. The concept is proven in daily use. The revamp is about consolidating and strengthening that proven concept, and preparing it for a large planned expansion (Janice 2.0, a personal-assistant side).

## 2. The stack and how the pieces connect
- Frontend: Lovable-generated app. React + Vite + TypeScript + shadcn/ui (per project memory; verify versions in package.json). Theme is navy #1B2A4A and gold #F0A500, navy sidebar, an "Ask Claude" panel. Auth is Supabase email/password and gates the whole app.
- Database: Supabase project wifuhcqpmvixipxejanb. PostgREST is hit directly from the client and from external scripts. Realtime is enabled on key tables.
- Agents: one Google Apps Script project (NOT in this repo, lives in Google's editor). It holds a CONFIG block and runs three scheduled jobs plus is the intended home for all future Gmail and Calendar automation.
- Skills: Claude skills stored outside the repo, triggered from chat, that read and write Supabase and draft Gmail. They are part of the product even though they are not in the codebase.

A revamp that only touches the Lovable frontend is fine, but decisions there must stay compatible with the Apps Script agents and the skills, because those are how data actually arrives and how work actually gets done. The frontend is the window, not the whole building.

## 3. Data model (probed live, authoritative for columns)
Single-user app: there is effectively one human. A `user_id` column exists on some tables but is not currently used to scope anything. RLS is disabled (see section 8). IDs are UUIDs on every table EXCEPT `todos`, whose id is an integer.

- todos: id (int), created_at, title, detail, source_email_id, sender, last_seen_at, status, sort_order, origin. Status is one of open, completed, archived. Origin is email, chat, or manual (manual renders a "CLAUDE INPUT" badge). source_email_id is the Gmail message id, used for dedup. NOTE there is NO thread_id column despite code that expects one (see section 7).
- students: id, user_id, student_name, parent_name, parent_phone, parent_phone_2, parent_email, subject (Maths/English/Both/null), enrolment_status, is_priority, created_at. Roughly 160 students in a normal term. Currently empty (end-of-term wipe).
- contact_log: id, user_id, student_id, date_contacted, method, outcome, logged_at, calendly_event_id. The single most important table for business logic (see P2 rules below). Currently empty.
- archived_contact_log: same shape as contact_log, for retired history.
- weekly_focus: id, parent_name, week_start, created_at. The list of parents to contact this week, rewritten every Monday.
- assessments: id, student_name, assessment_name, due_date, topics, subject, completed, created_at.
- email_templates: id, template_name, subject, body, created_at. Placeholders use FIRST NAMES ONLY.
- sms_templates: id, user_id, template_name, body, created_at.
- term_settings: id, user_id, term_name, term_start_date, p2_deadline, is_active, created_at.
- calendly_mismatches: bookings that could not be matched to a student, for manual resolution.
- app_settings: key-value app configuration.

### The P2 rule (the most important invisible logic in the whole app)
"P2" means a parent catch-up. A student counts as P2 DONE only if their MOST RECENT contact_log entry is one of:
- method = "FULL P2" AND outcome = "Reached" (green "P2 Complete" badge), OR
- method = "Low Risk Parent" AND outcome = "Noted" (teal "Low Risk" badge, bg #CCFBF1, text #0F766E)

Both count toward P2 totals. Any newer entry of a different kind flips the student back to not-done. This "most recent entry wins" logic drives the tracker's badges, its stats panel, and every completion count. A revamp MUST preserve it exactly. Other badges seen in the tracker: SMS Sent (purple), Email Sent / Report Sent (blue), Attempted (amber), No contact (grey), Overdue (red, over 3 days), Contact This Week (purple/lavender, from weekly_focus).

Consequence for any bulk operation: never write a contact_log row that would become the most recent entry for a student who is already P2 done, or you silently undo their status. Fetch existing logs, find the most recent per student, and skip the done ones.

## 4. Feature-by-feature intent (the why behind each screen)
- To Do List: three tabs (Active, Completed, Archived), drag to reorder, inline edit. Badges: EMAIL / CHAT / CLAUDE INPUT by origin, a gold "New" badge that auto-fades under 2 hours, an Overdue badge over 3 days. Dates render like "Mon - 1/06". Purpose: a single action surface fed automatically from email plus manually by Claude, so Ollie starts each day with one list.
- Parent Catch-Up (the P2 tracker): the operational heart. Full roster table, a term info bar, a "This term" stats panel (P2 complete / outstanding / overdue / rate / focus this week), all realtime. Row actions: log contact, SMS, email, history, delete. Sort order: Overdue, then Contact This Week, then Priority, then alphabetical by parent, then Done at the bottom. Search by student or parent name. Export button copies parent FIRST NAMES (not emails) of everyone not yet P2 done. Purpose: make sure every family is spoken to each term, and make the gaps impossible to miss.
- Assessments: colour-graded cards (gold over 3 days out, light green within 3 days, amber today, red overdue, faded when complete, hidden after 7 days). Mark Complete is a deliberate separate tick with confirmation, NOT click-to-complete. Purpose: never let a student's school assessment slip past unnoticed.
- Ask Claude panel: in-app chat surface. Relevant because several planned actions (adding todos, adding assessments) are intended to route through Claude skills rather than in-app forms.

## 5. The agents (Apps Script, not in this repo but part of the system)
All three follow the same loop: wake on a schedule, read a source, think with Claude where judgement is needed, write to Supabase, and let the app surface the result. Understanding this loop is key to the revamp, because 2.0 adds five more agents on the identical pattern.
- Gmail to-do extractor: hourly 5am to 5pm. Two entry points exist, run5am (12-hour lookback) and run9am (4-hour lookback). Reads the business inbox, asks Claude which emails contain real tasks, writes todos. Dedup is meant to be by source_email_id AND thread_id, but thread_id does not exist yet, so dedup is email-id only and same-thread duplicates can return.
- Calendly P2 sync: daily. Matches parent-feedback bookings to students and writes a FULL P2 / Reached contact_log row, or logs a calendly_mismatch.
- Weekly focus selector: Mondays 6am. Clears weekly_focus, picks 18 PARENTS (siblings grouped, not 18 students) who still need a P2, and writes them. The app highlights their children lavender.

## 6. Design language and principles to preserve
- Navy #1B2A4A and gold #F0A500. Cards, rounded corners, the badge system above. Keep it. The revamp should feel like a sharpening of the same app, not a new skin.
- The chunking principle (central to the roadmap): never show a far-off number without the near, actionable chunk in front of it. Applied first to a Goals feature, but it is the house style for surfacing anything with a long horizon.
- Pillars sit above goals: the business as a long-term wealth vehicle, and family first. These display quietest of all, one line at the top. They are context, not tasks.
- Quiet by default, drafts not actions: agents prepare and suggest; the human approves anything that reaches another person or touches money. Low-stakes housekeeping can happen unattended.

## 7. Known bugs and their exact state (as at 17 July 2026)
- thread_id column missing: the extractor's thread-level dedup is dead code because the column was never added. Fix needs BOTH `alter table todos add column thread_id text;` AND verification that the script reads and writes it. Until then, expect occasional duplicate todos from the same email thread.
- run5am vs run9am asymmetry, UNRESOLVED: on 17 July, run5am (12h) returned 0 action items while run9am (4h) returned 2, from the same two emails, 84 seconds apart. Both emails were inside the 12h window and neither was in the database yet, so the lookback window and the email-id dedup are both RULED OUT. The fault is either a fetch cap or filter difference between the two functions (the log said a suspiciously round "Fetched 8 emails"), or the larger 8-email Claude prompt returning empty (truncation or prompt issue). Diagnosis needs the actual Apps Script code. This is a strong candidate to fix during the revamp by unifying the two entry points into one parameterised function.
- Transient Anthropic overloaded_error (529): a scheduled run failed once on capacity, not a code fault, but the Claude call has no retry. Add retry with exponential backoff (2s, 4s, 8s) so these self-heal instead of emailing an alert.
- New-student toast: a realtime INSERT subscription on students that does not fire. Needs the table confirmed in the supabase_realtime publication and the client subscription checked (channel, filter, SUBSCRIBED status).

## 8. Security posture (must be addressed, ideally as part of the revamp)
RLS is currently DISABLED on every table. Because PostgREST is called with the public anon key (which ships in the client bundle), the entire database is readable and writable by anyone who extracts that key. This has been confirmed with a live test. A full fix is written and ready (see the separate security runbook): move the Apps Script and the four data-writing skills off the anon key onto a service_role key or a login token, then enable RLS with an authenticated-only policy, verify anon returns nothing. The golden rule is ordering: move the automations off the anon key FIRST, enable RLS LAST, so nothing breaks mid-flight. A revamp is the natural moment to bake this in properly, including making sure every client call goes through the Supabase client (which carries the logged-in token) rather than any raw anon fetch.

## 9. Where this is heading: Janice 2.0 (design for it, do not build it yet)
An approved expansion adds a Personal side behind a Business | Personal toggle and a daily PIN. Five new agents on the same Apps Script + Claude + Supabase loop: a Morning Brief (in-app card that narrates the day), a Money Watcher (bank-email alerts, direct-debit register, net worth from manual statement drops), a Friendship Keeper (contact cadence per person with drafted openers), a Personal Inbox agent (digest plus flags), and a Goal Tracker (the chunk ladder). Plus a Key Dates register for annual high-consequence obligations, and a "bring the calendar to life" principle where events are narrated with what they need, not just listed. New tables are planned (friends, direct_debits, transactions, net_worth_snapshots, key_dates, goals, briefs and more). The revamp should leave clean seams for this: a modular structure where a new "mode" and new feature areas can be added without disturbing the business core, a consistent agent-writes-to-table-then-app-reads data flow, and a shared component and styling layer the personal side can reuse.

## 10. Landmines (things that have actually broken Janice, do not relearn these the hard way)
- Radix Dialog is incompatible with iOS Safari touch events. Modals built on it fail on the iPad. Prefer inline, conditionally-rendered panels; the app deliberately pushed creation forms out to Claude skills for this reason. Any revamp modal must be verified on iOS Safari touch, not just desktop.
- Large multi-feature changes have broken the layout and forced reverts. Work in small, isolated changes. For a big revamp, proceed feature by feature with a working app between each step.
- Apps Script has broken from duplicate function names. When replacing a function, replace it wholly and keep names unique.
- Destructive database operations must be dry-run first with row counts shown, and backed up before any wipe. The owner is risk-averse; never delete without confirmation.
- PostgREST DELETE with no filter is blocked; the all-rows pattern is `?id=neq.00000000-0000-0000-0000-000000000000`. PATCH by the UUID id, never by a name field (special characters break URL encoding).
- CSV imports parse by column INDEX, not by header name, because exports contain duplicate headers (two "Surname" columns). Do not switch to header-keyed parsing without accounting for this.
- Never override a completed P2 status with a bulk write (see section 3).
- Written content in this project uses NO em dashes or en dashes, anywhere. Match that in any generated copy, comments, or docs.

## 11. What "good" looks like for this revamp
- Legible to a non-specialist owner: clear names, obvious structure, comments where the business rule is non-obvious (P2 logic, dedup, the sort order).
- The invisible rules from this brief encoded explicitly in code and tests, so they cannot silently regress. The P2 "most recent wins" rule in particular deserves a unit test.
- One clean data-access layer to Supabase, all of it authenticated, ready for RLS.
- The three agents' behaviour preserved exactly, with the extractor's two entry points unified and dedup made real (thread_id added and used).
- A modular shape that can absorb the 2.0 personal modules without touching the business core.
- Still a fast, calm iPad experience in navy and gold, verified on iOS Safari.

## 12. Questions Claude Code should resolve from the repo or ask Ollie before large changes
- Actual framework versions, folder structure, and state-management approach (this brief does not know them).
- Whether any client code calls PostgREST with a raw anon fetch outside the Supabase client (matters for the RLS fix).
- How the Ask Claude panel is wired, and whether in-app actions can trigger skills.
- The exact current Supabase client setup and where the keys live in the frontend.
- Confirm before: any schema change, any destructive operation, any change to the P2 logic, any new modal on iOS, and enabling RLS (which must follow the runbook ordering).

## Companion documents Ollie holds
janice-handover-v2 (full current state and history), janice-security-fix-runbook (the click-by-click security fix), janice-security-roadmap, janice-implementation-plan (the 10-item backlog with open questions), and the Janice 2.0 Executive Proposal. Ask for any of these if deeper context on a specific area is needed.
