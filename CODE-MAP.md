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

Realtime covers contact_log, students, weekly_focus, term_settings and
calendly_mismatches through the signed in client, matching the old
tracker's five tables exactly. The fifth went back on 21 August 2026
when the mismatch banner was built.

## Calendly display verification, 12 August 2026

The Calendly sync is a Google Apps Script (syncCalendlyP2s) outside both
repos. It writes a FULL P2 with Reached row to contact_log when a parent
books a feedback meeting, or a calendly_mismatches row when it cannot
match the booking. Touch Points only displays the result. Traced end to
end and confirmed working: the contact_log subscription listens on every
event type, so an external insert refreshes the roster exactly like a UI
write, and badges, the six stat tiles and the P2 progress bar all derive
from the one refetched logs value in a single render, so they cannot
disagree or lag. calendly_event_id is safe because every contact_log
query names its columns explicitly, the app never runs an UPDATE against
contact_log, and the realtime handler ignores the event payload and
refetches instead, so nothing is coupled to the row shape. Externally
written rows render correctly in the history panel, which falls back
cleanly on a missing method, outcome or date.

Two ordering and formatting risks were found and tested against the live
database on 12 August 2026. Neither is live:

1. NULL logged_at. supabase-js emits no nulls directive when nullsFirst
   is unset (postgrest-js PostgrestTransformBuilder, the ternary that
   returns an empty string), so Postgres applies its default, which for
   DESC is NULLS FIRST. A contact_log row with no logged_at would
   therefore outrank every real entry, and latestPerStudent takes the
   first row seen per student, so that row would become their most
   recent entry permanently. A FULL P2 with Reached row would pin the
   student as P2 Complete forever, and no later contact would flip them
   back. Old Janice's own mismatch resolution inserts contact_log
   without logged_at, so such rows were plausible. VERIFIED NOT LIVE:
   contact_log.logged_at has DEFAULT now() and there are currently zero
   NULL logged_at rows. Hardened anyway on 12 August 2026, because the
   failure mode is silent and permanent: the query now orders logged_at
   descending with nulls last, then date_contacted descending with nulls
   last, then id descending, so a timestamp-less row can never be
   treated as the newest and ties are deterministic.

2. Timestamp shaped date_contacted. formatSydneyFullDate builds
   new Date(value + "T00:00:00Z"), which is correct for a plain date but
   produces an invalid date for a full timestamp, and Intl then throws
   RangeError rather than degrading, which would crash the history panel
   render. VERIFIED NOT LIVE: date_contacted is a DATE column, so the
   value is always a plain date. Left alone by ruling. The same latent
   throw exists on the term line if a term row ever carries a null
   p2_deadline.

## Touch points on the tracker row, 12 August 2026

A touch point is a lighter contact taken from the notes screen. It is NOT a
completed P2 and it must never displace a status badge, so it runs on a
parallel track and is excluded from status derivation entirely.

Built as Option B: daily_notes is read at display time and matched to
students by name, and nothing is ever written to contact_log. Matching
mirrors the no_match convention. Names are normalised with trim, lowercase
and collapsed internal whitespace, and a note is attributed only when
exactly one ACTIVE student matches. A note matching nobody, or matching two
enrolled students who share a name, is recorded against nobody rather than
guessed at.

The read is scoped to the current term via term_start_date. With no active
term row there is no term start to scope to, so it falls back to a rolling
ninety day window, which is close enough to one term that the indicator
means roughly the same thing either way.

The guard against a status being displaced lives in p2.ts.
TOUCH_POINT_METHOD is deliberately NOT in CONTACT_METHODS, so it never
reaches the log contact dropdown and, more importantly, never trips the two
vocabulary tests. Adding it to that constant would have broken the test that
asserts every pair derives something other than "none", and would have made
the flip-back test assert that a touch point flips a done student back,
which is the opposite of the ruling and would have passed while doing it.
latestStatusEntryPerStudent filters touch points out before delegating to
latestPerStudent, which is left untouched so every existing test still
exercises the same function.

Option A, writing a Touch Point contact_log row when a note is saved, was
considered and deferred. Option B needs no new rows, no dedup rule, no
migration, and is reversible by deleting one module. Option A would put
touch points in the contact history panel and make them visible to old
Janice and to the agents, which Option B does not. If that is ever wanted,
Option A needs: a students fetch on the Today screen, which does not load
the roster today, an insert after the note insert that sets logged_at
explicitly, a dedup rule of one row per student per day enforced client side
first and later by a unique partial index on student_id and date_contacted
where method is Touch Point, and the same exactly-one-active-match rule
applied at write time instead of read time. The p2.ts guard already built
here is what makes Option A safe to add later.

## calendly_mismatches: the review feature, built 21 August 2026

Mismatched bookings surface on the Parents screen. loadRoster reads id,
invitee_name, student_name_given, event_start_time and reviewed from
calendly_mismatches filtered to reviewed false, ordered by event time
ascending, as the fifth entry in the existing Promise.all. That read is
deliberately outside the fatal error check: if it alone fails the roster
is still correct, so the screen shows no banner rather than blanking.

A red banner sits between the progress bar and the search pill whenever
any exist, reading "N Calendly booking(s) need review" in the existing
badge danger tokens, and disappears entirely at zero. It is the whole
strip, not a label with a button: tapping anywhere on it toggles an
inline panel below it, never a dialog. There is no session dismiss on
the banner, unlike old Janice: at zero it is gone, and above zero it is
the point.

MismatchPanel.tsx lists each booking with the invitee name, the name the
parent typed and the Sydney event time. src/lib/mismatch.ts ranks the
roster and offers up to three one tap options, each labelled with both
the student and the parent name so what is being confirmed is
unmistakable, plus a search box over the full roster as the fallback.
Ranking only orders the candidates. Nothing is ever auto confirmed,
because a wrong attribution writes a completed P2 against the wrong
student, which is worse than the gap it was meant to close.

Confirming inserts a FULL P2 with Reached contact_log row dated from the
Sydney date of the event start, then sets reviewed true. The new row is
pushed into the same logs state the badges, six stat tiles and progress
bar all derive from, so every one of them updates in the same render.
If the insert succeeds but the mark fails, the panel says the contact
was saved and the booking could not be cleared, rather than implying
nothing happened.

Both improvements planned in the earlier porting notes were built:

1. logged_at is set explicitly on the match insert, so the row can never
   sort as the newest entry forever and pin a student as complete.
2. Dismiss is no longer silent. The control reads "Not a P2", not
   "Dismiss", and takes a second tap behind the question "Set aside with
   no contact recorded?". More importantly it is reversible: "Show
   bookings set aside" reads back the reviewed true rows and each offers
   "Bring back", which sets reviewed false and returns the booking to
   the banner. Nothing needed a schema change, because reviewed was
   always a boolean that could be set either way. The old behaviour let
   a real parent meeting be waved away in one tap and never land, with
   no way to find it again.

Not built: the old modal presentation, and any write to calendly_mismatches
beyond the reviewed flag. The Apps Script owns every other column.

## Phase 1 plan (as built)

1. Update AGENTS.md to point at the two migration documents.
2. Extend AppView and both switcher forms to five items, verified to fit at 320px.
3. Pure P2 status module (strict rule, latest entry wins) ready for the Phase 2 unit test.
4. Extend theme tokens with badge colours for all eight statuses, both themes.
5. Read only TrackerScreen: active students, latest log per student, badges, default sort, search, term bar, six stat panel, loading, empty, and failure states, all through the existing client.
6. Verify with the 3 real students plus seeded fake rows, tsc and build clean, layout checked at phone and desktop widths in both themes.
