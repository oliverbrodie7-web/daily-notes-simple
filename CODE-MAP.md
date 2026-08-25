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
students by name, and nothing is ever written to contact_log. Names are
normalised with trim, lowercase and collapsed internal whitespace, and a
note is attributed only when exactly one ACTIVE student matches. A note
matching nobody, or matching two students who could both fit, is recorded
against nobody rather than guessed at.

The rule was rewritten on 21 August 2026 after it was found to be counting
almost nothing. See the section below.

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

## Board view on Parents, 25 August 2026

The table is now one of three views. A switcher sits on the left of the row
that holds the student count, and the Board is a four column layout of the
same students.

### The four columns are one calculation, not a second one

lib/board.ts decides nothing about P2. It is handed done, overdue and the
derived status the table already worked out, and only chooses between them:

    done -> P2 Complete
    overdue -> Overdue
    status "none" -> No contact
    anything else -> Tried

The order matters, because the states overlap: a student past the deadline
with nothing logged is both overdue and without contact. Asking in that
order makes the four exclusive and exhaustive, which is what makes the
counts add up to the roster under any filter. The test suite checks that
sum against applyFilter for every tile, so a future change to the P2 rule
cannot silently split the board away from the table.

The board is handed `filtered`, the same array the table maps over, after
the sort, the tile filter and the search. It cannot show a different set of
students because it is not given one. Switching views is a rendering choice
and nothing else.

### One panel, one definition, twice

The card opens the history panel by making the very same openPanel("history")
call the table's History button makes, and the panel that appears is the same
ContactHistoryPanel component. It was lifted out of TrackerScreen for this
and the table now imports it back, so there is one definition of what a
student's history looks like and one piece of state saying whose is open.
Two views cannot drift apart or both be open at once.

TouchDots moved out of TrackerScreen for the same reason. EngagementBar's
onOpen became optional: inside a card the whole card is the button, so a
second one within it could not be tapped. Its non interactive form is a span
rather than a div so it stays legal inside a button element.

lastContact moved up into `decorated`, built once, so the row's status line
and the card's last line are the same string rather than two expressions
that happen to match today.

### What the screenshots caught that the measurements did not

Every measurement passed on a panel that, in a picture, was invisible: it
takes --surface-raised, which is exactly what a board column takes, so it
read as a hole in the board rather than something attached to a card. The
same picture showed a table sized panel in a 244px column, with a date
wrapping to four lines beside a Delete button. Both are fixed in CSS scoped
to .board-item, so the table's panel is untouched: the card's surface, a
column's worth of padding, and Delete below its entry rather than beside it.

A second picture showed the parent name and the phone number both being
truncated on a narrow card. Half a phone number is worse than none, so the
number now holds its width and the name gives way, which is what the table
already does.

### Widths

.app-main is capped at 1060px, so a 1440px window gives the board about
1004px whatever the screen. Four columns at 1200px and up, two below that
so Overdue and No contact sit above Tried and P2 Complete, and below 900px
the board is not used at all: the phone card layout takes over and the
switcher is not drawn. The screen leaves the switcher out at that width and
a media query hides it as well, because a resize can outrun a listener.

Columns never scroll. align-items: start lets them grow to what they hold
and the page scrolls, which is the point of a board.

### Cards is offered but not built

viewToRender maps "cards" to "table". The option is real, remembered and
tappable, and it shows the table rather than nothing. The moment a card
layout exists that function returns it and nothing else changes. The choice
lives in touch-points-roster-view, a key of its own; the colour scheme key
and the sidebar key are untouched.

### Sorting

Hidden while the Board shows, because a board has no order to change.
sortKey and sortDirection are left alone, so switching back to Table
restores whatever was set.

### Verified

Nine widths, three colour schemes, in Chromium against a copy of the real
styles.css: no horizontal overflow anywhere, four equal columns aligned to
the top, no column with an overflow of its own, every card and every control
at least 44px, names on one line with an ellipsis, an empty column at full
width saying "Nothing overdue", the slab under the chosen word in all three
positions, sliding at 200ms with motion and arriving at once without it, and
a card reachable by Tab announcing "Alice Dominguez-Fitzgerald, Overdue.
Open the contact history." with a 3px outline. The components themselves
were rendered with react-dom/server and the markup checked against what the
harness measured, so the two cannot have been measuring different things.

## Tally strip corrected, 25 August 2026

Two problems, and the first of them was my specification rather than the
code.

### The counters count notes written now, not drafts

All three counters used to skip any note whose draft_created was not true.
Drafts are made by the nightly job at 7:30pm, so the today number read zero
for the whole working day and only filled in after everyone had gone home.
The Added today list sat directly underneath showing three notes while the
number above it said nought.

The draft rule is gone from tallyNotes. A note counts the moment it is
saved. TallyNote is now just { note_date }, so the counters cannot even see
whether a draft exists, which is what stops the two rules being confused for
one another again. hasDraft is gone with it rather than left sitting there
implying the counters still use it.

The bar is untouched and still counts students reached through
matchTouchPoints, which owns the draft rule. Three notes written this
afternoon move all three counters at once and move the bar not at all until
tonight. That difference is the point of the strip.

### Why the week number fell during a day

None of the three suspected causes was it, and all three are ruled out by
the code rather than by opinion.

The exclude today rule did not leak. It lives in matchCount in
touchPoints.ts, and tally.ts imports only mondayOf, p2Rate and
matchTouchPoints. A test now asserts tally.ts contains neither matchCount
nor a compare against today.

The week boundary was already Sydney. mondayOf(sydneyTodayIso()), with
sydneyDateIso naming the zone explicitly in Intl, so the ambient zone cannot
move it.

The counters and the bar were already one fetch. tallyView passes one array
to both.

The actual cause was staleness. sydneyTodayIso() was called INSIDE the
useMemo that works the numbers out, and was not in that memo's dependency
list. Nothing in the list changes at midnight, so a tab left open kept
yesterday's date, and with it yesterday's Monday. Crossing a Sunday moves
that boundary back a whole week: mondayOf("2026-08-23") is 2026-08-17,
mondayOf("2026-08-24") is 2026-08-24. So the strip showed last week's total
all morning, and snapped down to this week's the moment a note was added,
which is the number falling while notes were only being added.

Today's Sydney date is now held in state on the Today screen, refreshed on a
minute timer and when the tab is focused or made visible, and it is a real
dependency of the numbers, of the suggestion strip and of the match line.
Those three used to read the clock separately in three places.

### Still outstanding

The term read has no upper bound, so during a school holiday, when
pickTermForDate holds the term that just finished, notes written after that
term ended are counted as this term. Not touched here.

## Touch point history on Today, 24 August 2026

A note in Added today that matches a student now says how many touch points
that student has had this term, and the line opens their history when there
is any. Nothing else on the screen changed.

The count is not a second calculation. It reads the map matchTouchPoints
already builds, which is what the Parents screen counts by, so the two
cannot say different numbers about the same student. matchCount turns that
map into what the line shows and whether there is anything to open, and
returns null when there is nothing to count from, which is what makes a
failed read a missing count rather than a broken list.

### Corrected the same day: the count now excludes today

The first version counted every drafted note this term, today's included, so
a student written about once today read "1 touch point this term" as though
they had been contacted before when they had not. The draft rule was not
enough on its own: the nightly job drafts notes at 7:30pm, so from that
point a note written this morning starts counting itself.

matchCount now takes today's Sydney date and drops every entry dated today,
not only the note the line sits on, so a student written about twice today
and never before reads the same thing on both notes. The wording carries it:
"2 other touch points this term", "1 other touch point this term", "No other
touch points this term". The word "other" is load bearing and has to stay.

The panel is untouched and still shows the whole term, today included, which
is right: it is a record rather than a count, and the two are meant to
differ. Its own label no longer borrows the count wording, so the "other"
change could not make it say something untrue.

A line with no earlier touch points is not tappable, even when the panel
would have today's note in it. The count is the affordance.

The panel is the one the Parents screen already had, pulled out into
TouchPointsBody. The Parents screen still shows it inline under a row,
exactly as it did. Today wraps the same body in a dialog, because the list
underneath is where a person is working and it has to close on escape, close
on a tap outside, trap focus and hand it back. That is the only difference
between them, and the wording, the dates and the order come from one place.

The brief said this screen does not read the term, the roster or past notes.
It does, as of the tally strip the day before, so this needed no new read at
all. The one thing added is that the term's notes are read again after a
note is added or removed, on top of being kept in step in place, so the
counts are right against the database and not only against what the screen
believes.

### Two things the numbers missed

A screenshot caught both, which is the second time on this feature that the
boxes all measured correctly while the page was wrong.

flex-wrap was on the tappable variant of the match line and not on the line
itself. The count holds its width, so on a plain line the name was the only
thing that could give, and "Matched to Bob Turner" collapsed to one letter
per line. Every box was still inside the note and every word was still
correct, so nothing failed. The check now asserts the name is no more than
three lines tall and wider than a letter, and that check was proved by
putting the bug back.

The tick was a flex item of its own, so a long name wrapped to the next line
and left it stranded. The tick and the name are now one item.

### Nothing marks the tappable line at rest

The line has no border or underline until it is hovered, which is the same
convention the tappable touch dots on the Parents screen already use. It
means a person cannot tell by looking which lines open. Left that way for
consistency rather than decided.

## Touch point tally strip on Today, 24 August 2026

A strip across the top of the Today screen, above the input card and across
both columns on a wide screen. Nothing else on the screen changed.

Two different questions sit in one panel and keeping them apart is the whole
point. The three numbers count notes written: today, this week, this term.
The bar underneath counts students reached at least once this term, which is
the goal, one touch point per student. Somebody can write ninety six notes
and have reached only sixty of the roster. The labels carry the difference:
"today", "this week", "this term" against "Students reached this term".

One rule runs through all of it. A note counts only once draft_created is
true. A note held back with no draft never reached a parent and is counted
nowhere, which is the same rule the Parents screen counts touch points by
and is already inside matchTouchPoints for the bar.

The bar reuses matchTouchPoints rather than a second version of it, so a
student with five notes counts once, an ambiguous name counts nowhere, and
the Parents screen and this strip can never disagree about who was reached.
studentsReached hands back the count and the percentage together so the bar
and the wording beside it come from one calculation, and it rounds with
p2Rate so the two bars in this app never round a percentage differently.

tallyView decides all three states in one tested function: hidden when a
read failed, loading until both the notes and the roster have arrived, and
the numbers otherwise. A wrong number would be read as a real one, so a
failure shows nothing at all rather than zeros, and loading shows a dash
rather than a nought so a slow read is never mistaken for a bad day.

The term's notes now carry their id, which is what lets a removal be taken
out of them without reading the term again. A note added goes into them as
well, built from the row that was just written. None of the numbers move
when one is added, because it has no draft yet, and that is correct rather
than a bug to work around. Removing one can move them: a note written this
morning and drafted this evening still sits on the list until midnight.

### The browser's own list indent

A ul keeps a 40px padding-inline-start that the reset at the top of
styles.css does not clear, because that reset only zeroes margin. The tally
row was silently indented and its labels squeezed, and the numbers said
everything was fine because the boxes were all still inside the panel. A
screenshot caught it. The check now asserts the row's padding is zero and
that no unit's words run into the ones before them.

The same thing is true of .bulk-list and .bulk-chips in the bulk upload
panel, which are indented 40px and 40px narrower than they should be. NOT
fixed here, because this task said not to change the bulk upload. It needs
one line on each rule.

Measured at nine widths in all three schemes across six states, including
three figures on every unit and a deliberately absurd four figure one: the
three stay on one row at every width, stepping down at 379 and again at 329
rather than wrapping, and the label shortens rather than colliding if the
numbers are ever larger than that.

## Progress bar percentage, 24 August 2026

The P2 bar's right hand side now reads the percentage in bold green, then
the count in the softer colour at the size it always was.

The percentage comes from p2Rate in p2.ts rather than from an expression in
the component, so the width the bar draws and the number it says are the one
value. It rounds to the nearest whole number, clamps at 0 and 100, and
returns 0 on an empty roster rather than dividing by zero. Plain rounding
does reach a hundred one short of the lot on a roster of a thousand, which
this centre is nowhere near, and the tests say so.

Adding a percentage made the right hand side wider, and on a phone that
pushed the whole head onto two lines where it used to be one. The label is
the decorative half, so it gives up the room: it steps to 9.5px at 430 and
8.5px at 379, narrowest last the way the rest of this file is ordered.
Measured, the head stays on one line at 430 and 390 at every value up to 162
of 162, at 360 for everything except 162 of 162, and drops the value under
the label at 320. The value itself never breaks, at any width.

The second Sort control, the one above the table, is gone. The top bar has
one and the column headings sort as well, so the row above the table now
carries the student count and nothing else.

Checked at nine values including 0 of 0, 0 of 162, 161 of 162 and 162 of 162,
at nine widths in all three schemes, with the percentage on screen compared
against the count printed beside it rather than against the function that
drew it.

## Bulk upload on Today, 23 August 2026

A Word document holding several students becomes one note per student. The
way in is a thin divider reading "or" under the Add note button, then an
outlined "Upload a document" button. No other screen changed, and what
happens to a note once it is saved did not change either.

mammoth was not actually in package.json when this was asked for, only in
node_modules. It is a dependency now. The private Lovable registry is
blocked from this container, so bun could not rewrite the lockfile itself:
the entries were generated by resolving mammoth alone in a scratch project
and merged in, and the result passes bun install with a frozen lockfile.
mammoth's argparse is nested under mammoth/argparse because the app already
has argparse 2 at the top level.

The Node entry cannot read an ArrayBuffer, which is all a file picker gives
you, so the import is mammoth/mammoth.browser.js and it is a dynamic import
inside the handler. That keeps 484KB out of the first load and out of the
server bundle entirely, and it was checked by loading the built chunk in a
real browser and reading a real .docx through it.

### What a line is

The first version read mammoth's plain text. That was wrong for the real
documents and the reason is worth keeping.

extractRawText puts "\n\n" after every paragraph, so a paragraph document
arrives with a blank line between all of them and the empty paragraph a
person typed between students arrives as two. Splitting on the pair puts the
paragraphs back. That part worked.

What it cannot do is a table. A soft line break inside a cell is a break
element, and raw text drops it entirely: the real document came back as
"Alice DMultiply > AlgorithmWorked through the harder ones..." with a whole
student run together into one unreadable line. Its four document paragraphs
were all empty, so the paragraph reader found nothing at all in it.

convertToHtml keeps everything: the table, the cells, and every break, as
<table><tr><td><p>Alice D<br /><br />Multiply &gt; Algorithm<br />...</p>.
So the reader now takes HTML and the plain text path is gone.

Two things about that call are load bearing. ignoreEmptyParagraphs must be
false, because mammoth throws empty paragraphs away by default and in a
paragraph document those are what separate one student from the next.
And the entities have to be decoded, because mammoth escapes the greater
than sign and every topic is written with one.

Verified with real .docx files, built here, read through the actual built
browser chunk in Chromium rather than through the Node entry, for the table
shape, the paragraph shape and a broken one of each.

### Two shapes

A table document is a one column table with one student per cell, and the
lines inside a cell are soft breaks. A paragraph document is three lines per
student with a blank line between them. When a document holds a table, the
table is what counts and loose paragraphs around it are ignored, because
that is where the students are and reading both would invent students.

Inside a cell the blank lines are dropped first, then the first line is the
name, the last is the note, and everything between them is the topic joined
with a comma. That is what makes a cell of four lines work without a
separate rule. An empty cell is spacing, so it is passed over rather than
refused; a cell with one or two lines in it is refused and named.

A cell is counted in document order including the empty ones, because that
is what a person sees when they count down the table.

### Strictness

In a paragraph document: three lines, then one blank line, then the next
student. Nothing else is accepted. Blank lines at either end of the file are tolerated, because they
are an artefact of Word and cannot hide a student, and the line numbers
still point at the real document. Everything else is refused with the line
that stopped it, its exact text, and what was expected there. Whatever was
read cleanly before that point is still offered, because a document that
goes wrong at line 40 has 13 good students in it.

A tolerant reader is the failure this feature exists to prevent, so the
parser never skips a line looking for the pattern. The test that matters
most asserts that a well formed student further down a broken document is
NOT read.

### Saying where it stopped

The error panel keeps its shape and its wording changes with the shape it
was reading. A paragraph refusal still says which line stopped it and quotes
that line. A table refusal says which cell, in words up to the tenth, and
shows the cell's text on its own lines, which the found box already renders
with its breaks kept. The sentence underneath changes too: telling a person
that each student needs three lines with a blank line between them is wrong
advice when the document is a table.

### The tutor initials

One or two words at the very end, at most three letters each, with at least
one capital. The capital is the whole discriminator: "work" and "Lov" are
the same shape and only the capital separates them. Three letters rather
than four keeps ordinary words like "Ella" and "work" off the end. Nothing
is stripped when it would leave the note empty, so a note that is only
initials survives whole. It is a heuristic and it can be wrong, which is
why the preview shows the note text that would be saved.

### The batch

toCards, inBatch and batchCount live in the lib rather than the panel, and
one predicate decides both the number on the button and what is inserted,
so the count and the insert cannot drift. A note whose name and text both
match one already on today's list is out of the batch by default, compared
after trimming, collapsing whitespace and lowercasing.

The cards are built while rendering rather than in an effect, keyed off the
parse result itself. In an effect keyed off today's notes, the refresh that
follows a partial save would have rebuilt the batch and thrown away every
skip and every hand match, which is what it did before it was caught.

MatchStudentPanel now takes noteId as string or null. With null it writes
nothing and simply hands the choice back, because on a preview there is no
row to point at. Nothing about the Today list changed.

Escape closes the picker first when the picker is open, so one press cannot
throw the whole batch away.

Greying is a flatter surface and softer wording, never opacity on the card.
Opacity took the Undo control down with it and left it at 1.7 to 1 against
its background, which is not a way back. The one faint colour is the
"Already added today" label, which the brief asks for by name and which the
times and "Added by" lines on that screen already use.

Measured at 1440, 1180, 1024, 900, 768, 430, 390, 360 and 320, in all three
schemes, for the preview, both error states and the Today card: capped at 600
wide, inside the viewport, filling a phone, scrolling rather than growing,
nothing escaping the padding box, every control at least 44 tall, the note
clamped to three lines, and nothing less readable than the app's own
soft-on-raised pairing.

## Re-engagement panel on Parents, 23 August 2026

The way in is an item in the existing dots menu on a student row, reading
"Draft a re-engagement email", in its own group above Delete student. The
panel is presentation only: every rule already lived in src/lib/reengage.ts
and none of it moved into the component.

The facts the panel judges by come off the row it was opened from.
hasEmailed is keyed off daysSinceLast rather than the number of emails,
which is the same trap the engagement column fell into: an email count
counts what is loaded, and what is loaded starts at week three.
assessmentSoon is passed as null on purpose. This screen cannot see
assessment dates, so the first rule never fires today. If those dates ever
land, pass them in that one field and the rule starts working with nothing
else changed, rather than the panel guessing now and being wrong quietly.

The detail a template can mention comes from latestTidiedText, the newest
tidied wording on a note matched to that student. A template that needs a
detail and has none is listed but greyed with "needs a recent note about
this student", not hidden. Hiding it would make the list a different
length for every student and take away the one thing worth knowing, which
is why it cannot be used. When none of the five can be filled the greyed
list stays and one line is added above it saying to write a note on the
Today screen first.

Nothing loading at all is a separate message. Blaming the note when the
read failed would send you off to write one for no reason, so no templates
means "the wording could not be loaded", and the list is not rendered.
The reengagement_templates read on this screen is never fatal for the same
reason the panel is not: the rest of the screen has nothing to do with it.

The panel creates no draft, sends no email and writes nothing. A test
reads the component's own source and asserts that supabase, .insert(,
.update(, .delete(, .upsert( and fetch( appear nowhere in it, the same
guard already on reengage.ts. A second test asserts the copying goes
through the shared copyText helper rather than navigator.clipboard
directly, so the fallback cannot be bypassed by a later edit.

Copied is one key, not a set, so only the button that was tapped changes
and it changes back after two seconds. Copy all is the subject, a blank
line, then the body, which is what pasting into an email client wants.

Measured rather than asserted, at 1440, 1180, 1024, 900, 768, 430, 390,
360 and 320, in all three schemes, for the full panel, the all greyed
panel and the nothing loaded panel: capped at 620 wide, inside the
viewport, filling a phone, scrolling rather than growing, nothing escaping
the padding box, every control at least 44 tall, exactly one template
recommended and that one open, greyed exactly where it cannot be filled,
the email keeping its line breaks, and the over 160 count readable against
the surface it sits on.

## Templates, the sixth screen, 22 August 2026

Editing the five re-engagement templates. In the Setup group below
Settings, behind the same shared PIN, and named through nav_labels like
the others with a fallback of Templates.

src/lib/reengagement.ts holds the rules. updatePayload builds the update
rather than the call site doing it, so only email_subject, email_body,
sms_body and updated_at can ever leave: an extra column cannot creep in
by accident. The app never inserts or deletes a row and never writes key,
name, when_to_use, needs_detail, id or sort_order.

Each card holds its own draft keyed by the template's key, so editing one
cannot reach another and an unsaved card never blocks saving a different
one. The warnings and the character count only ever warn. A template with
no name placeholder in it may well be deliberate, and an SMS over 160
characters is worth saying but not worth blocking.

ORIGINAL_TEMPLATES IS DELIBERATELY EMPTY and this matters. The five rows
and their original wording live in the database and are not knowable from
here. Filling that constant with invented copy would make Reset destroy
the real templates rather than restore them, so it ships empty and Reset
falls back to the wording the screen loaded, which undoes the current
session's edits and can never lose anything already saved. The
confirmation says which of the two it is about to do. Paste the real
originals into the constant and Reset uses them instead, with no other
change needed.

The sixth tab is what made the phone bar tight. Templates is the longest
name at 60px wide, against tabs of 63px at 430, 56px at 390, 53px at 360
and 47px at 320. The label steps to 9px at 429 and 8px at 369, measured
rather than guessed, so the whole word fits at every width instead of
truncating. Found while doing it: the 329px rule added the day before sat
BEFORE the 379px block and was silently overridden, so it had never
applied. The blocks are now ordered narrowest last.

## Three fixes and a rename feature, 22 August 2026

### The engagement panel crash

formatSydneyShortDate took a date column value and glued T00:00:00Z onto
it. The panel passed parent_emails.received_at, a full timestamp, so the
result was unparseable and Intl threw rather than returning a placeholder,
which the root error boundary turned into a blank page. It fired for every
parent with an email, so the panel had never worked.

The panel narrows to the calendar day now, and all three date formatters
plus formatSydneyTime narrow internally and return an empty string when
they still cannot read a value. A caller no longer has to know which shape
a column holds. The new test in dates.test.ts is the one that was missing:
it takes a built Engagement and pushes every receivedAt through the
formatter, which is the seam every scoring test walked straight past.

### The top bar at the bottom of the page

Each screen rendered its own ScreenBar. Fine on a plain block root, wrong
on a grid with named areas: Today declares input, suggest, list and strip,
Manager declares input and list, and an item with no grid area is auto
placed into an implicit row after every named one. That dropped the bar to
the bottom of the page. Output, Parents and Settings were unaffected, and
it was never rendered twice.

The bar is now rendered once by the shell, in ScreenFrame. Screens send
their subtitle and actions into it through a portal rather than lifting
that state upwards, because the action buttons close over the screen's
live values and anything copying them into the shell would have to list
every dependency correctly or fire with stale ones. Through a portal the
buttons stay in their own tree.

### Renaming the screens

daily_notes_settings.nav_labels holds the display text. src/lib/navLabels.ts
falls back per value, not per object, so one blank name never takes the
rest with it, and the app can never show an empty label. useNavLabels reads
it once and holds it beside the colour scheme; Settings calls back into it
after a save so a rename reaches every screen with no refresh.

The internal keys never change. Renaming touches display text only, and a
test asserts the key lists stay put even when every name is blanked.

A twenty character name does not fit a fifth of a 320px phone bar at any
readable size. The label shrinks to 8.5px at the tightest widths and then
truncates with an ellipsis inside its own tab. Worth recording how that
was found: the measurement passed while the labels were 123 to 149 pixels
wide inside 58 pixel tabs, because it compared each label against itself
and the overflow was visible rather than scrolling. The check now compares
the label to its tab. That is the third time this exact mistake has been
made, after the stat labels and the sidebar rows.

## Suggestion strip on Today, 21 August 2026

A quiet strip below the input card naming up to five students whose parent
is in this week's focus and who have not been written about this term.

src/lib/focus.ts is now the one place the parent name rule lives.
TrackerScreen had a local normaliseParentName; it imports the shared one
now, unchanged in behaviour, so the tile and the strip cannot drift apart.
Touch points reuse matchTouchPoints and the draft_created rule exactly as
the Parents screen does, and the term window comes from pickTermForDate
with the same ninety day fallback.

The week rule is deliberately NOT shared, and this is worth knowing. The
Parents tile takes the newest week_start present in the table, whatever
week that is. The strip insists on the Monday of the current Sydney week
and shows nothing otherwise. That difference is intentional here: a stale
list is worse than no list when the app is nudging someone to write about
a child. It also means the two can disagree, with the tile showing a count
from an old list while the strip shows nothing. The tile's loose week rule
was reported on 21 August 2026 and left alone because this task was scoped
to the Today screen.

The chips are inert on purpose and that is the whole design. A tappable
chip that filled the student name field would make it easy to write about
a child who was not in that evening, which is the one thing this must not
encourage. They are spans, not buttons, with no pointer cursor, no shadow
and no hover, and nothing in the strip is focusable. The section carries
an aria-label naming the students and everything inside it is aria-hidden,
so a screen reader hears one sentence rather than a heading, a list of
chips and a note.

No warning colours anywhere, checked by scanning every painted colour in
the strip rather than by eye.

## Touch points cell redesigned, 21 August 2026

The filled accent badge with a big number was the loudest thing in the row
for what is only a count, and it shouted over the engagement bar beside it.
It is now a row of dots above a line of text: one dot per touch point, up
to five, filled for a reply and hollow otherwise, then "5 sent, 3 replied"
underneath. The column narrowed from 132px to 128px, which goes to the
student names.

src/lib/touchDots.ts holds the shape. Worth knowing why it counts rather
than pairs: there is no per touch point reply link in the data. Touch
points come from daily_notes matched to a student by name; replies come
from parent_emails matched to a parent by address. Nothing joins one to the
other, so of N dots the first R are filled. That also satisfies the rule
that a reply is never hidden behind the cap.

Because replies belong to a parent and touch points to a student, siblings
share a reply count. The reply count is therefore clamped to the number
sent, or a row could read "2 sent, 3 replied", which is nonsense on one
student's row.

Engagement gained a `replies` field for this. It counts every touch point
reply in the term regardless of the week 3 rule, the same way
daysSinceLast does: the week 3 rule is about scoring engagement, not about
whether a parent replied.

Two notes on the spec as given. It described a separate replies chip
stacked under the badge, which did not exist in the code; there was only
the badge. And the hollow dot's 1.5px border is declared as asked, but
Chromium floors a fractional border width to 1px at every device pixel
ratio, so it renders at 1px. It still reads as hollow, dark included,
where the filled dot is solid pale blue grey against a dark centre with a
pale ring.

--chip-shadow went with the badge, which was its only consumer.

## Engagement column, 21 August 2026

Built from parent_emails, a table a weekly job fills. The app only reads
it and never writes to it, the same arrangement as manager_touch_points
and calendly_mismatches.

src/lib/engagement.ts holds the whole rule. A student is matched to their
emails on parent_email, trimmed and lowercased on both sides. Siblings
share an address, so they share one entry and show identical figures,
which is intended rather than a duplicate.

An email the parent started is worth 1. A reply to an email you sent about
their child is worth a third: still contact, just contact you started.
Weights add up across the term and the total only ever goes up, so a
parent who was in touch early keeps the credit. Nothing before week 3
counts, week 3 beginning fourteen days after the term start, because the
first fortnight is timetable season and would flatter every family
equally.

The last email line deliberately ignores the week 3 rule, so it always
reflects reality: a parent who emailed in week 1 and then went silent
reads as a real silence rather than as never having emailed. That split
matters for the Gone quiet tile too. "Emailed at least once this term"
means the term, not week 3 onwards, so a parent whose only email came in
the first fortnight can still go quiet even though it scored nothing.
Only a parent who has sent nothing at all is exempt, because going quiet
requires having spoken first. The tests cover both halves of that.

Six levels by total weight: 6 or more Very engaged, 3 Engaged, 1.5 Warm,
0.5 Cooling, above zero Cold, exactly zero Nothing. Five new colours per
scheme, --engage-very through --engage-cold, plus --engage-empty for the
unfilled segments. The light and mist values are darker than a first
sketch because the label sits at 10.5px and has to read: measured on the
table surface they run from 4.9 to 6.5 to 1. That does push gold and
orange closer together in hue than they would otherwise be, which is a
deliberate trade of hue separation for legibility, and the labels say
Warm and Cooling anyway.

The bar is a real button only when there is something to open. With
nothing to show it is a plain element, so it never sits in the tab order
as a dead control, and the level and last email line are still announced
through a visually hidden line.

Known and accepted: the Nothing label, the Counting from week 3 label and
a quiet last email line all use --text-faint, which the spec named. That
measures 2.66 on light, 2.35 on mist and 3.12 on dark. It is the app's own
faint token used everywhere else, but at 10px it is the weakest text in
the app, and --text-soft would fix it in one line if that is ever wanted.

P2 Rate lost its tile to Gone quiet. It was the one tile that never
filtered, because a percentage is not a list of students; every tile
filters now. The rate itself is unchanged and still drives the progress
bar underneath.

## Sidebar and screen bar, 21 August 2026 (part one of two)

Layout only. The attention counts and the phone tab bar are part two.

From 900px up the app header and the segmented control are both gone,
replaced by a vertical rail on the left and a bar belonging to the current
screen. Below 900px nothing changed: the header and the floating tab bar are
exactly as they were.

The segmented control was deleted rather than hidden. It only ever showed at
900px and above, which is precisely where the rail now sits, so nothing was
left for it to do. Its markup, its CSS and its --seg tokens went with it. One
token survived under an honest name: --seg-shadow is now --chip-shadow,
because the touch badge still uses it.

src/components/Sidebar.tsx is the rail: brand, three groups (Daily, Follow
up, Setup), and a foot pinned to the bottom holding the colour scheme
switch, Lock and Sign out. It reuses the tab bar glyphs and the padlock
rather than redrawing them, so the two navigations cannot disagree about
what a screen looks like. Parents keeps the two person outline the tab bar
already had.

src/components/ScreenBar.tsx is the bar. Each screen renders its own, which
is the whole reason no screen state had to be lifted: a screen already holds
its note count, its batch date, its term and its actions, so it passes them
straight in. The one thing the shell owns is the collapse control, and that
reaches the bar through a context carrying nothing else. The bar renders on
a locked screen too, so the sidebar control stays reachable and the layout
does not jump when it unlocks.

What moved into the bar: the Output date arrows and batch date, the Parents
heading, term line, Sort control and overflow menu, and the counts that used
to sit beside the Today and Manager list headings. Those two chips and the
Output date row lost their markup, so .today-count, .manager-count,
.output-datebar and .output-date-centre were removed from the stylesheet.

src/hooks/useSidebar.ts holds the collapsed state under its own key,
touch-points-sidebar. The colour scheme key is untouched. With nothing
stored, the width decides: collapsed below 1100px, expanded above it, and it
follows the window across that breakpoint until the person chooses, after
which their choice stands at every width.

termWeek came back into terms.ts for the bar's term line. The old Current
Week tile had the only week arithmetic in the app and it went with that tile
earlier today. The new one is tested, including that the P2 deadline of 11
September falls in week 8 of a term starting 20 July.

One thing worth knowing: the rail theme switch gets 44px tall options,
scoped to the rail. The header's compact 30px version is untouched, because
the rail's own quality bar asks for full tap targets on every control in it.

## Stat tiles filter the list, 21 August 2026

Current Week was removed: the term bar above already names the week. In its
place, fifth of six between Focus this week and P2 Rate, is No touch point,
counting active students with no touch point at all this term. It reads the
same touchPointsByStudent map the row badge reads, so the tile and the badge
can never disagree, and a student showing a badge of zero is counted here.
Its number takes the warning colour, since it is a job to do.

Tapping a tile filters the list to exactly the students it counts. Tapping
it again clears it, tapping another swaps to it, and only one is ever on.
P2 Rate does not filter and is not a button, because a percentage is not a
list of students.

src/lib/rosterFilters.ts is the single definition. Each filter carries its
tile wording, its bar wording, its empty line, its tint and its predicate,
and BOTH the tile's number and the filtered list run that one predicate:
the count is applyFilter(key, rows).length and the list is
applyFilter(key, sorted). They are the same calculation, so the number in
the bar and the number on the tile cannot drift apart. Only the counting
lives there; whether a student is done, overdue, in the focus or touched is
decided upstream in decorated, which the row badges also read.

The filter applies on top of the existing sort and search rather than
replacing them. The bar's count is deliberately the tile's number, not the
number of rows on screen, so a search narrowing further does not change it.

Filter state is plain useState with nothing persisted. The route renders one
view at a time, so leaving Parents unmounts the screen and the filter is
gone on return, which is what was wanted.

Two fixes went in alongside. A zero rendered as "00" because padCount padded
to two characters unconditionally; tileCount now returns "0" for zero and
keeps the deliberate padding on a real count. And the stat labels had
white-space nowrap with no width cap, so at 320px "FOCUS THIS WEEK" and
"NO TOUCH POINT" spilled across the neighbouring tiles. Below the six across
breakpoint the labels now wrap instead. That one was invisible to the
measurements and only showed up in a screenshot, because a nowrap label
grows rather than clipping itself, so scrollWidth never exceeds clientWidth.

Known and left alone: .stat-label and .stat-faint use --text-faint, which is
2.66 to 1 on the surface. That is pre-existing styling shared by every stat
label on the screen, so changing it is a separate decision about the token
rather than part of this work.

## Name matching rewritten, 21 August 2026

The first version compared the typed name against the full student_name and
nothing else. Tutors type a first name, usually with a surname initial like
"Charlie S", so almost every note was attributed to nobody: about 45 parent
emails had been drafted while the Parents screen showed a touch point count
of one. The nightly job was already matching those same notes, because it
falls back to the first name, so the app was strictly weaker than the
process that had already proved the notes were matchable.

daily_notes gained a student_id column, a uuid referencing students, empty
on every existing row. matchNote in src/lib/touchPoints.ts now works
through four steps in order against the ACTIVE roster, normalising both
sides the same way throughout, and stops at the first that resolves:

1. student_id, which is a decision a person already made and beats
   everything below. An id pointing outside the active roster means that
   student was made inactive since; the note is then unmatched rather than
   falling back to guessing at the name.
2. The full name, character for character once normalised.
3. A first name and a surname initial, with or without a full stop. The
   given names are accepted as well as the first name, so "Mary Jane W"
   reaches Mary Jane Wu the same way "Charlie S" reaches Charlie Smith.
4. A bare first name.

Every note comes back as exactly one of three outcomes: matched naming the
student, ambiguous listing the students that could fit, or unmatched. Two
students who both fit is ambiguous at every step, never a guess. The Parents
screen counts only matched notes and still requires draft_created to be
true, so ambiguous and unmatched notes are counted nowhere.

The Today screen shows the outcome per note on a line under the note text:
a green tick and the matched student, or the warning card with either the
real count of students that could match or "No student found" plus a Match
to a student button. The button opens MatchStudentPanel, a panel over the
screen with escape, outside click, a focus trap and focus return. Tapping a
row writes student_id AND overwrites student_name with the full name, so the
nightly job, which only reads the typed name, matches it too. There is no
confirm step: one tap is the match, and it is trivially correctable by
matching again.

For an ambiguous note the panel lists the candidates the matcher found. For
an unmatched note it lists the five closest first names, with no similarity
floor, because an empty panel is a dead end and the search fallback covers
the rest.

The Today screen loads the active roster to do this, which it did not
before. That puts student and parent names on a screen outside the PIN
gate, unlike the Parents screen. Everything is still behind the Supabase
sign in, and tutors already type student names here, so this was accepted
rather than overlooked.

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
