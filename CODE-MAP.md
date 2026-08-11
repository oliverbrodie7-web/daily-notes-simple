# CODE-MAP: Touch Points and the Parent Tracker migration

Findings from a read only pass of this repo and the old tracker (nimble-list-ai), 5 August 2026.

## Touch Points as actually built

- Stack: Vite + TanStack Start (React, TypeScript, bun). One route (src/routes/index.tsx, SSR off) holding four views in plain state: Today, Output, Manager, Settings. Nav is src/components/ViewSwitcher.tsx: an iOS style segmented control at 900px and above, a floating icon tab bar below. Both are hard set to four items (grid repeat(4, 1fr), slab translate maths), so a tracker view means widening them.
- shadcn is NOT in use. components.json remains, but every shadcn component was deleted early on. All styling is plain CSS custom properties in src/styles.css (.theme-light / .theme-dark). There is no active Tailwind token layer to derive from; the variables are the tokens.
- Supabase: one client, src/lib/supabase.ts, env vars with baked in fallbacks. URL confirmed as the shared project (wifuhcqpmvixipxejanb). Every data call in the app goes through this signed in client; no raw PostgREST fetches anywhere.
- Auth: Supabase email and password (SignIn.tsx), session persisted. Manager and Settings share a four digit PIN gate (usePinGate + LockGate, 15 minute in memory unlock, hash in daily_notes_settings.manager_pin_hash).
- Tokens: light app #FCC640, surface #FFFFFF, header #42055A, text #42055A, accent #6A2B8E, accent soft #F4ECF9, warning #D38A2E set; dark app #14171C, surface #1E232A, accent #8FA6BF, and a standing rule of no purple and no yellow in dark. Fraunces 600 headings, Figtree body. Radii 18 (cards) and 12 (buttons, fields). 900px breakpoint, 1060px centred limit. Sydney date helpers and a clipboard helper with fallback already exist.

## Old tracker behaviours the two documents did not mention

- Log contact vocabulary: methods FULL P2, Low Risk Parent, SMS only, Email No Report, Email Full Report; outcomes Reached/Voicemail/No Answer for FULL P2, single auto selected outcomes (Noted, Sent) otherwise. Editable date_contacted defaulting to today (local time, not Sydney aware).
- A "Parse with AI" button in log contact maps free text to method and outcome via a server function. FULL P2 without Reached renders the Attempted badge.
- Inconsistency in the old code: badges and sort treat ANY Low Risk Parent row as done, while export and stats require Low Risk Parent + Noted. The documents state the strict rule; recommend encoding the strict rule everywhere.
- Overdue is term deadline based (p2_deadline passed and not done), not "over 3 days". A second sort mode toggle, Contact Status, exists beside the default rank.
- Export Emails copies lines of "First <email>;" deduped by email, done excluded, with a manual copy fallback panel. The documents say first names only with no emails. Needs a call.
- Per row gold priority star toggling is_priority. Student delete requires typing DELETE and removes the student's contact_log rows first. History delete uses a native confirm per entry.
- Term bar shows term name, P2 date, and a countdown pill inside 14 days ("Nd, X outstanding"). The stats hero has SIX stats including Current Week ("Wk 05") from term_start_date, zero padded.
- Term settings: saving deactivates every term then upserts the active one. A typed RESET flow archives all contact_log rows into archived_contact_log tagged with the term name, deletes them all (neq zero uuid pattern), and deactivates the term.
- Calendly mismatch banner and review modal sit on the tracker (unreviewed rows, realtime). Realtime also covers term_settings and calendly_mismatches beyond the documented three tables, plus a window app:refresh event.
- Weekly focus matches by trimmed lowercased parent name against the latest week_start only; the focus badge and count hide once a student is done. Only enrolment_status Active students appear, with an "N active" count. Subject pills for Maths, English, Both.
- SMS uses sms_templates with {{parent_name}} and {{student_name}} filled with first names and opens an sms: link; the button needs a phone number. Email creates a real Gmail draft through a server function, not mailto.

## Gaps and contradictions against the documents

1. Restyle target: the docs assume shadcn and a Tailwind config; the real token system is CSS variables. Same intent, different mechanism.
2. "Route and nav entry" translates here to a fifth state view and switcher work, not a router route.
3. Export contents, the Low Risk strictness, tracker PIN placement (behind the shared gate or open), and the server function features (AI parse, Gmail draft) all need Ollie decisions; none are covered by the plan.
4. Dark mode currently allows one accent plus the warning amber; eight distinct badge statuses need the token set extended consistently in both themes.
5. The Radix modal landmine does not apply here: no Radix exists and the app already uses inline panels and native confirms.
6. RLS narrative conflict: the original Touch Points brief said RLS is on for daily_notes; the Janice brief says RLS is disabled everywhere. Phase 4 assumes disabled. Verify in the dashboard before running the runbook.

## Status and deferrals

Phase 1 (read only tracker), Phase 2 (log contact, history with per
entry delete, student delete, all behind the P2 unit test) and Phase 3
(SMS and email buttons, export, weekly focus, realtime, P2 progress bar)
are built.

Deferred by ruling, 5 August 2026: the old tracker's Parse with AI free
text button is NOT ported in v1; the log contact panel is structured
fields only.

Deferred by ruling, 11 August 2026: the old tracker's Gmail draft server
function is NOT ported in v1. The email button opens a mailto prefilled
from email_templates instead. A Gmail draft flow can return later as a
skill, which is where the roadmap already points it.

Decided, 11 August 2026: the export copies parent FIRST NAMES ONLY,
comma separated, for students not yet P2 done, with no email addresses.
The old tracker's "First <email>;" behaviour is deliberately dropped.
Parents are deduplicated by trimmed lowercased full name, so a parent
with two children is copied once, matching the way the weekly focus
matches names and the way the Monday agent picks 18 parents rather than
18 students.

Realtime covers contact_log, students, weekly_focus and term_settings
through the signed in client. The old tracker also watched
calendly_mismatches, which is not subscribed here because the Calendly
mismatch banner it fed has no surface in Touch Points yet. If that
banner is ever ported, the fifth subscription goes back with it.

## Phase 1 plan (as built)

1. Update AGENTS.md to point at the two migration documents.
2. Extend AppView and both switcher forms to five items, verified to fit at 320px.
3. Pure P2 status module (strict rule, latest entry wins) ready for the Phase 2 unit test.
4. Extend theme tokens with badge colours for all eight statuses, both themes.
5. Read only TrackerScreen: active students, latest log per student, badges, default sort, search, term bar, six stat panel, loading, empty, and failure states, all through the existing client.
6. Verify with the 3 real students plus seeded fake rows, tsc and build clean, layout checked at phone and desktop widths in both themes.
