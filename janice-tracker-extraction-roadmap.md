# PARENT TRACKER MIGRATION - GAMEPLAN AND ROADMAP (v2, Touch Points edition)

Mission: move the Parent Catch-Up Tracker (the P2 tracker) out of the Janice Lovable app and into the EXISTING Touch Points app (repo: oliverbrodie7-web/daily-notes-simple), restyled to match Touch Points' look. Same Supabase database underneath. Janice keeps everything else (To Do List, Assessments, Ask Claude) and slims down.

This document is the delivery plan. The companion file janice-claude-code-brief.md carries the deep context (business rules, schema, landmines) and must sit in the Touch Points repo alongside its existing AGENTS.md. Claude Code reads both.

---

## 0. The destination, and why it fits

Touch Points is a small Lovable-origin app (Vite + TypeScript + shadcn) for jotting quick notes about students through the day, with Supabase sign-in, used by one person. That makes it a natural home rather than an arbitrary one: notes about students and contact with their parents are two halves of the same relationship record. Down the track (NOT v1) the pairing enables good things, like a student's row showing their latest touch point, and touch-point notes feeding the progress-email skills. For now the mission is strictly: tracker in, restyled, working.

What the ready-made destination removes from the original plan: no new repo, no hosting setup, no auth build (sign-in exists), no design system from scratch. What remains is the real work: porting the tracker's logic faithfully, restyling it, securing the shared database, and cutting over.

## 1. The honest triage: what is big and what is not

1. **No data migration exists in this project.** All tracker data (students, contact_log, weekly_focus, term_settings, templates) lives in Supabase, not in Lovable code. Touch Points reading the same tables sees the same truth instantly.
2. **The agents need zero changes.** The Calendly P2 sync and Monday focus selector write straight to the database. Live probe proof: weekly_focus has fresh agent-written rows right now. Whichever app displays them is irrelevant.
3. **The timing is a gift.** The roster is nearly empty (3 students, 0 contact logs) and the term import is pending. Build and test against harmless data; the import lands in the shared database visible to BOTH apps, so neither blocks the other.

The genuinely big parts: faithful logic port (the P2 rules above all), the restyle done properly (tokens, not hardcoded colours), the security fix (more urgent now, see section 3), and a disciplined cutover.

**Scope guard:** v1 is the tracker only, plus the already-tabled P2 progress bar (the new home is its natural landing spot). No todos, no assessments, no notes-tracker crossovers yet.

## 2. Verified facts about the destination repo (checked 5 August 2026)

- Public GitHub repo, Lovable-origin (.lovable folder present), Vite + TypeScript, bun, shadcn/ui (components.json), prettier, and an existing AGENTS.md.
- README: notes stored in Supabase, sign-in required. .env.example has empty VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY placeholders with "built in defaults" baked into the code.
- **Claude Code step one: open the Supabase client setup in src and CONFIRM the baked-in default URL is the shared project (wifuhcqpmvixipxejanb).** Ollie states it is the same database. If the code says otherwise, STOP and flag before anything else, because auth, sessions and the security plan all hinge on it.
- Because the repo is PUBLIC: never commit a service_role key, a password, or any secret to it, ever. The anon key is public by design and fine. Post-RLS, baked-in defaults are safe; pre-RLS they advertise an open database, which feeds the urgency below.

## 3. Security: moved to the end of the build, with one hard condition (decided 5 August 2026)

Ollie's call: the migration build happens FIRST, and the security fix (the existing runbook, resume trigger "start again") runs at the END of the build. This is workable because the build runs against a near-empty database, and because every line of new tracker code is written authenticated-only from the first commit (all calls through the app's existing signed-in Supabase client, no raw anon fetches anywhere), so RLS switches on later with zero rework.

THE HARD CONDITION, non-negotiable: **security before data.** The term roster import does NOT happen until RLS is live and verified. An open database advertised by a public repo must never hold 160 families' details. If the roster is needed mid-build to run the term, the security fix jumps the queue at that moment. Never both at once (roster in, RLS off).

Public-repo rule stands regardless of sequencing: never commit a service_role key, a password, or any secret. The anon key is public by design and fine.

## 4. Restyle rules (colour scheme decision: match Touch Points)

- Claude Code derives the design tokens (palette, radii, spacing, type) from Touch Points' Tailwind config and existing components, and builds the tracker screens from those tokens. No Janice navy and gold imported.
- **Badge colours are load-bearing, so their MEANINGS survive even as their hues adapt.** The tracker needs visually distinct statuses for: P2 Complete (success), Low Risk (calm secondary success), SMS Sent, Email/Report Sent, Attempted (warning), No contact (neutral), Overdue (danger), Contact This Week (highlight). Map each onto Touch Points' palette; where the palette is too small, extend it consistently rather than hardcoding one-off hex values. At-a-glance distinctness on an iPad screen is the acceptance test.
- Same for the assessment-style card grading if reused later: semantic, tokenised, not copied hex.

## 5. What must port faithfully (the fidelity checklist)

Behaviours, not looks. Encode explicitly; the first item gets a unit test before any write path ships.
- P2 completion rule: a student is done only if their MOST RECENT contact_log entry is FULL P2/Reached or Low Risk Parent/Noted. Any newer entry of another kind flips them back.
- Badge semantics per section 4, driven off that rule.
- Sort order: Overdue, then Contact This Week, then Priority, then alphabetical by parent, done at the bottom.
- Stats panel: P2 Complete, Outstanding, Overdue, Rate, Focus this week.
- Row actions: log contact (INLINE PANEL, never a Radix or shadcn Dialog in a touch path, the iOS Safari landmine applies fully to Touch Points' stack), history with per-entry delete, student delete with confirmation, typed-word confirmation for anything bulk.
- Search (student or parent name), term info bar from term_settings.
- Export: parent FIRST NAMES only, not yet P2 done, to clipboard.
- Templates: first names only in placeholders.
- Never-override rule for any bulk write: fetch logs, most recent per student, skip the done ones.
- Realtime subscriptions on students, contact_log, weekly_focus.

## 6. The phased plan (resequenced 5 August 2026: build first, security before data)

**Phase 1, integration foundation (1 to 2 sessions).** Claude Code first confirms the repo's baked-in Supabase URL is the shared project (hard stop if not). Brief + this roadmap added to the repo, AGENTS.md updated to point at them. New Parents (or Tracker) route and nav entry in Touch Points. Read-only roster table, badges, stats, sort, search, styled in Touch Points tokens, every call through the signed-in Supabase client. Verified on the 3 real students plus seeded fake volume data.
**Phase 2, core interactions (2 sessions).** Log-contact inline panel, history with per-entry delete, student delete. The P2 unit test lands before the writes do.
**Phase 3, comms and life (1 to 2 sessions).** SMS buttons with templates, export, weekly focus highlighting, realtime, the P2 progress bar in Touch Points styling. Email button v1 decision applies (mailto with template prefilled recommended; Gmail-draft flow deferred to a skill). Confirm iPad PWA behaviour of the whole app. THE BUILD IS NOW COMPLETE.
**Phase 4, the security fix (the known 30 to 45 guided minutes).** The runbook runs: automations and skills off the anon key, RLS on, anon verified to return nothing, Touch Points note-saving and tracker both retested signed in. This phase MUST complete before Phase 5.
**Phase 5, import + parallel run (1 session + a week of real use).** Term roster imported via the student-importer skill into the secured database, visible to both apps. Touch Points becomes the daily driver; old Janice tracker stays as the safety net. Both must agree on every badge and stat. Watch agent writes appear in the new UI untouched.
**Phase 6, cutover (half a session).** One narrow Lovable prompt removes the Parent Catch-Up nav and route from Janice, nothing else. Handover docs updated.

Total estimate: 5 to 7 build sessions plus the parallel week.

## 7. Risks and mitigations

- **Logic drift:** mitigated by the fidelity checklist, the brief in-repo, the P2 unit test, and a side-by-side week where both UIs must agree on every badge and stat.
- **Wrong database:** if the baked-in default is not the shared project, everything changes. Mitigated by the hard stop in section 2, step one.
- **Security ordering:** runbook order is law; automations off anon first, RLS last, rollback SQL on hand. Public repo never holds a secret.
- **iOS touch bugs:** inline panels only for tracker interactions; every interactive element verified on the actual iPad before a phase closes.
- **Restyle shortcuts:** hardcoded hex sneaking in instead of tokens. Mitigated by the section 4 rule and review.
- **Two trackers forever:** Phase 5 is scheduled when the parallel week STARTS, not someday.

## 8. Remaining decisions for Ollie (small now)

1. Email button v1: mailto with template prefilled (recommended), or hold the button until a Gmail-draft flow is rebuilt?
2. During the parallel week, the iPad home-screen icon: Touch Points (recommended) with Janice as fallback, or the reverse?
3. Cutover authority: explicit "yes remove it" after a clean parallel week (recommended), or is the clean week itself the green light?
4. Nav naming in Touch Points: "Parents", "Tracker", or keep "Parent Catch-Up"?

## 9. Definition of done

The tracker lives in Touch Points, styled as Touch Points, on the iPad, authenticated against the secured shared database. Every fidelity-checklist behaviour matches the old tracker. Agent writes appear without the agents changing. Janice no longer shows the tracker and still does everything else. New infrastructure cost: $0.
