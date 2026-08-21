import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PinGate } from "../hooks/usePinGate";
import { copyText } from "../lib/clipboard";
import {
  formatSydneyFullDate,
  formatSydneyDateWithYear,
  formatSydneyShortDate,
  formatSydneyTime,
  sydneyTodayIso,
} from "../lib/dates";
import { deriveStatus, isP2Done, latestStatusEntryPerStudent, type ContactStatus } from "../lib/p2";
import { parentEmailPairs, parentFirstNames, type MessageTemplate } from "../lib/templates";
import {
  lastTermEnd,
  pickTermForDate,
  termWarning,
  type TermRow,
  type TermWarning,
} from "../lib/terms";
import type { CalendlyMismatch } from "../lib/mismatch";
import { matchTouchPoints, type TouchPointNote } from "../lib/touchPoints";
import { supabase } from "../lib/supabase";
import { ImportHelpPanel } from "./ImportHelpPanel";
import { LockGate } from "./LockGate";
import { LogContactPanel, type SavedContactLog } from "./LogContactPanel";
import { MismatchPanel } from "./MismatchPanel";
import { TemplateManagerPanel } from "./TemplateManagerPanel";
import { TemplatePanel } from "./TemplatePanel";
import {
  AtIcon,
  CloseIcon,
  HelpIcon,
  HistoryIcon,
  MailIcon,
  MessageIcon,
  MoreIcon,
  PeopleIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  WarningIcon,
} from "./Icons";

type RosterStudent = {
  id: number | string;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  subject: string | null;
  is_priority: boolean | null;
};

type RosterLog = {
  id: number | string;
  student_id: number | string;
  method: string | null;
  outcome: string | null;
  logged_at: string | null;
  date_contacted: string | null;
};

type RowPanel = {
  kind: "log" | "history" | "delete" | "sms" | "email" | "touch";
  studentId: string;
} | null;

// The soon to run out reminder is dismissed for this browser session only,
// so it comes back on the next visit. The blocking one cannot be dismissed
// at all, because the numbers on screen are wrong until it is dealt with.
const RUNWAY_DISMISS_KEY = "touch-points-term-runway-dismissed";

function readRunwayDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(RUNWAY_DISMISS_KEY) === "yes";
  } catch {
    return false;
  }
}

// With no active term row there is no term start to scope to, so the touch
// point read falls back to a rolling ninety day window, which is close
// enough to one term that the indicator means the same thing either way.
const TOUCH_POINT_FALLBACK_DAYS = 90;

function fallbackWindowStart(): string {
  const start = new Date();
  start.setDate(start.getDate() - TOUCH_POINT_FALLBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

type ActiveTerm = TermRow;

type TrackerScreenProps = {
  pinGate: PinGate;
};

// The pill colour now comes from the row state (done, overdue, due this
// week, or neutral), so only the wording lives here.
const STATUS_LABELS: Record<ContactStatus, string> = {
  none: "No contact",
  p2_complete: "P2 Complete",
  email_report: "Email Report",
  low_risk: "Low Risk",
  attempted: "Attempted",
  sms: "SMS Sent",
  light: "Light Touch",
  // Filtered out before a status is ever derived, so this should never show.
  touch_email: "Touch Point Email",
};

// Short labels for the last contact line under the status pill.
const SHORT_METHODS: Record<string, string> = {
  "full p2": "Call",
  "full email report": "Email report",
  "low risk parent": "Low risk",
  "sms only": "SMS",
  "light touch": "Light touch",
};

function shortMethod(method: string | null): string {
  const key = (method ?? "").trim().toLowerCase();
  return SHORT_METHODS[key] ?? method ?? "Contact";
}

function normaliseParentName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function padCount(value: number): string {
  return String(value).padStart(2, "0");
}

export function TrackerScreen({ pinGate }: TrackerScreenProps) {
  const unlocked = pinGate.state === "unlocked";

  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [logs, setLogs] = useState<RosterLog[]>([]);
  const [terms, setTerms] = useState<ActiveTerm[]>([]);
  const [focusNames, setFocusNames] = useState<Set<string>>(new Set());
  const [touchNotes, setTouchNotes] = useState<TouchPointNote[]>([]);
  const [mismatches, setMismatches] = useState<CalendlyMismatch[]>([]);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [smsTemplates, setSmsTemplates] = useState<MessageTemplate[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<MessageTemplate[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panel, setPanel] = useState<RowPanel>(null);
  const [rowMessage, setRowMessage] = useState<string | null>(null);
  const [entryBusyId, setEntryBusyId] = useState<number | string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [toolPanel, setToolPanel] = useState<"help" | "sms" | "email" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [runwayDismissed, setRunwayDismissed] = useState(readRunwayDismissed);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  // The overflow menu closes on a tap outside or on escape, the way an iOS
  // popover does. It is anchored inline, never a dialog.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // The row overflow menu closes the same way the toolbar one does.
  useEffect(() => {
    if (!rowMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rowMenuRef.current?.contains(event.target as Node)) setRowMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRowMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenuId]);

  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const loadRoster = useCallback(async () => {
    const [studentsRes, logsRes, termRes, focusRes, mismatchRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, student_name, parent_name, parent_phone, parent_email, subject, is_priority")
        .eq("enrolment_status", "Active"),
      // Nulls last, then a deterministic tiebreaker. Postgres sorts nulls
      // FIRST for a plain DESC, so a row written without a logged_at would
      // otherwise outrank every real entry and pin that student as P2
      // Complete forever. The column has a default, so this is insurance.
      supabase
        .from("contact_log")
        .select("id, student_id, method, outcome, logged_at, date_contacted")
        .order("logged_at", { ascending: false, nullsFirst: false })
        .order("date_contacted", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }),
      // Every term, chosen from by date. is_active is deliberately not read.
      supabase
        .from("term_settings")
        .select("term_name, term_start_date, term_end_date, p2_deadline")
        .order("term_start_date", { ascending: true }),
      supabase.from("weekly_focus").select("parent_name, week_start"),
      supabase
        .from("calendly_mismatches")
        .select("id, invitee_name, student_name_given, event_start_time, reviewed")
        .eq("reviewed", false)
        .order("event_start_time", { ascending: true }),
    ]);
    if (!liveRef.current) return;
    if (studentsRes.error || logsRes.error || termRes.error || focusRes.error) {
      setLoadFailed(true);
      setStudents([]);
      return;
    }
    setLoadFailed(false);
    setStudents((studentsRes.data ?? []) as RosterStudent[]);
    setLogs((logsRes.data ?? []) as RosterLog[]);
    setTerms((termRes.data ?? []) as ActiveTerm[]);

    // Focus rows for the latest week only, matched by normalised parent name.
    const focusRows = (focusRes.data ?? []) as {
      parent_name: string | null;
      week_start: string | null;
    }[];
    const latestWeek = focusRows.reduce<string | null>(
      (max, row) => (row.week_start && (!max || row.week_start > max) ? row.week_start : max),
      null,
    );
    const names = new Set<string>();
    for (const row of focusRows) {
      if (!latestWeek || row.week_start !== latestWeek) continue;
      const name = normaliseParentName(row.parent_name);
      if (name) names.add(name);
    }
    setFocusNames(names);
    // Deliberately not part of the fatal check above: if this one read
    // fails the roster is still correct, so show no banner rather than
    // blanking the screen.
    setMismatches((mismatchRes.data ?? []) as CalendlyMismatch[]);

    // Touch points are read, never written. Scoped to the current term when
    // one is set, otherwise to a rolling window.
    const activeTerm = pickTermForDate((termRes.data ?? []) as ActiveTerm[], sydneyTodayIso());
    const windowStart = activeTerm?.term_start_date ?? fallbackWindowStart();
    const notesRes = await supabase
      .from("daily_notes")
      .select("student_name, note_date, note_text, added_by, draft_created")
      .gte("note_date", windowStart)
      .order("note_date", { ascending: false });
    if (!liveRef.current) return;
    setTouchNotes((notesRes.data ?? []) as TouchPointNote[]);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void loadRoster();
  }, [unlocked, loadRoster]);

  // Templates change rarely, so they load once rather than on every refresh.
  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      const [smsRes, emailRes] = await Promise.all([
        supabase.from("sms_templates").select("id, template_name, body").order("template_name"),
        supabase
          .from("email_templates")
          .select("id, template_name, subject, body")
          .order("template_name"),
      ]);
      if (!liveRef.current) return;
      setSmsTemplates((smsRes.data ?? []) as MessageTemplate[]);
      setEmailTemplates((emailRes.data ?? []) as MessageTemplate[]);
    })();
  }, [unlocked]);

  // Realtime: an agent write or a change on the other device refreshes the
  // roster in place, so badges, the stat strip and the progress bar all
  // recompute without a reload. All five tables the old tracker watched are
  // covered now that the mismatch banner has a surface.
  useEffect(() => {
    if (!unlocked) return;
    const refresh = () => {
      void loadRoster();
    };
    const channel = supabase
      .channel("touch-points-tracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_log" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_focus" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "term_settings" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendly_mismatches" },
        refresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [unlocked, loadRoster]);

  // Touch points are filtered out here, so a badge only ever derives from
  // the most recent entry that is not a touch point.
  // The term the screen works from, chosen by today's Sydney date. Every
  // downstream calculation reads this exactly as it did before.
  const today = sydneyTodayIso();
  const term = useMemo(() => pickTermForDate(terms, today), [terms, today]);
  const warning = useMemo<TermWarning>(() => termWarning(terms, today), [terms, today]);
  const lastEnd = useMemo(() => lastTermEnd(terms), [terms]);

  const latestByStudent = useMemo(() => latestStatusEntryPerStudent(logs), [logs]);

  const touchPointsByStudent = useMemo(
    () => matchTouchPoints(touchNotes, students ?? []),
    [touchNotes, students],
  );

  // Overdue mirrors the old tracker: no active term means nothing is overdue.
  const deadlinePassed = useMemo(() => {
    if (!term?.p2_deadline) return false;
    return new Date() > new Date(term.p2_deadline);
  }, [term]);

  const decorated = useMemo(() => {
    return (students ?? []).map((student) => {
      const status = deriveStatus(latestByStudent.get(String(student.id)));
      const done = isP2Done(status);
      const overdue = deadlinePassed && !done;
      const focus = !done && focusNames.has(normaliseParentName(student.parent_name));
      return { student, status, done, overdue, focus };
    });
  }, [students, latestByStudent, deadlinePassed, focusNames]);

  // Default sort: overdue, then contact this week, then priority, then
  // alphabetical by parent, with done students at the bottom.
  const sorted = useMemo(() => {
    const rank = (row: (typeof decorated)[number]) => {
      if (row.done) return 4;
      if (row.overdue) return 0;
      if (row.focus) return 1;
      if (row.student.is_priority) return 2;
      return 3;
    };
    return [...decorated].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (a.student.parent_name ?? "").localeCompare(b.student.parent_name ?? "");
    });
  }, [decorated]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter(
      (row) =>
        row.student.student_name.toLowerCase().includes(query) ||
        (row.student.parent_name ?? "").toLowerCase().includes(query),
    );
  }, [sorted, searchQuery]);

  const stats = useMemo(() => {
    const total = decorated.length;
    const complete = decorated.filter((row) => row.done).length;
    const outstanding = total - complete;
    const overdue = deadlinePassed ? outstanding : 0;
    const rate = total === 0 ? 0 : Math.round((complete / total) * 100);
    const focus = decorated.filter((row) => row.focus).length;
    let week: number | null = null;
    if (term?.term_start_date) {
      const start = new Date(term.term_start_date);
      start.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
      week = diff >= 0 ? Math.floor(diff / 7) + 1 : null;
    }
    return { total, complete, outstanding, overdue, rate, focus, week };
  }, [decorated, deadlinePassed, term]);

  const daysToDeadline = useMemo(() => {
    if (!term?.p2_deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(term.p2_deadline);
    deadline.setHours(0, 0, 0, 0);
    return Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  }, [term]);

  function openPanel(kind: NonNullable<RowPanel>["kind"], studentId: number | string) {
    setRowMessage(null);
    setDeleteConfirm("");
    setPanel((current) =>
      current && current.kind === kind && current.studentId === String(studentId)
        ? null
        : { kind, studentId: String(studentId) },
    );
  }

  // Export: parent first names only for everyone not yet P2 done, one entry
  // per parent, no email addresses at all.
  function dismissRunway() {
    setRunwayDismissed(true);
    try {
      window.sessionStorage.setItem(RUNWAY_DISMISS_KEY, "yes");
    } catch {
      // Private browsing can block storage; it stays dismissed for now.
    }
  }

  function showExportMessage(text: string) {
    setExportMessage(text);
    window.setTimeout(() => {
      if (liveRef.current) setExportMessage(null);
    }, 4000);
  }

  async function handleExport() {
    const names = parentFirstNames(
      decorated.filter((row) => !row.done).map((row) => row.student.parent_name),
    );
    if (names.length === 0) {
      showExportMessage("No parents left to contact.");
      return;
    }
    const copied = await copyText(names.join(", "));
    showExportMessage(
      copied
        ? `Copied ${names.length} first ${names.length === 1 ? "name" : "names"}.`
        : "The names could not be copied. Please try again.",
    );
  }

  // The BCC export: one "First <email>;" per line, which is what Gmail and
  // Outlook parse when it is pasted into a BCC field.
  async function handleExportEmails() {
    const pairs = parentEmailPairs(decorated.filter((row) => !row.done).map((row) => row.student));
    if (pairs.length === 0) {
      showExportMessage("No parents left to contact, or none of them have an email address.");
      return;
    }
    const copied = await copyText(pairs.join("\n"));
    showExportMessage(
      copied
        ? `Copied ${pairs.length} email ${pairs.length === 1 ? "address" : "addresses"} for a BCC field.`
        : "The addresses could not be copied. Please try again.",
    );
  }

  function handleLogSaved(log: SavedContactLog) {
    // Newest first stays true because logged_at is now; badges and stats
    // recompute from this state immediately.
    setLogs((current) => [log as RosterLog, ...current]);
    setPanel(null);
  }

  async function handleEntryDelete(entry: RosterLog) {
    if (entryBusyId) return;
    const sure = window.confirm("Delete this contact entry? This cannot be undone.");
    if (!sure) return;
    setEntryBusyId(entry.id);
    setRowMessage(null);
    const { error } = await supabase.from("contact_log").delete().eq("id", entry.id);
    setEntryBusyId(null);
    if (error) {
      setRowMessage("The entry could not be removed. Please try again.");
      return;
    }
    setLogs((current) => current.filter((log) => log.id !== entry.id));
  }

  async function handleStudentDelete(student: RosterStudent) {
    if (deletingStudent) return;
    if (deleteConfirm.trim() !== "DELETE") {
      setRowMessage("Type DELETE to confirm.");
      return;
    }
    setDeletingStudent(true);
    setRowMessage(null);
    const { error: logsError } = await supabase
      .from("contact_log")
      .delete()
      .eq("student_id", student.id);
    if (logsError) {
      setRowMessage("The student's contact log could not be removed. Please try again.");
      setDeletingStudent(false);
      return;
    }
    const { error: studentError } = await supabase.from("students").delete().eq("id", student.id);
    setDeletingStudent(false);
    if (studentError) {
      setRowMessage("The student could not be deleted. Please try again.");
      return;
    }
    setStudents((current) => (current ?? []).filter((entry) => entry.id !== student.id));
    setLogs((current) => current.filter((log) => String(log.student_id) !== String(student.id)));
    setPanel(null);
    setDeleteConfirm("");
  }

  if (!unlocked) {
    return <LockGate heading="Parents" gate={pinGate} />;
  }

  const loading = students === null;

  const statTiles = [
    { label: "P2 Complete", value: padCount(stats.complete), cls: "stat-success" },
    { label: "P2 Outstanding", value: padCount(stats.outstanding), cls: "stat-plain" },
    {
      label: "P2 Overdue",
      value: padCount(stats.overdue),
      cls: stats.overdue > 0 ? "stat-danger" : "stat-faint",
    },
    {
      label: "Focus this week",
      value: padCount(stats.focus),
      cls: stats.focus > 0 ? "stat-highlight" : "stat-faint",
    },
    { label: "P2 Rate", value: `${stats.rate}%`, cls: "stat-accent" },
    {
      label: "Current Week",
      value: stats.week ? `Wk ${padCount(stats.week)}` : "--",
      cls: "stat-plain",
    },
  ];

  return (
    <section
      className="tracker-screen"
      onPointerDownCapture={pinGate.touch}
      onKeyDownCapture={pinGate.touch}
    >
      {loading ? (
        <p className="tracker-message">Loading the roster</p>
      ) : loadFailed ? (
        <p className="tracker-message" role="alert">
          The roster could not be loaded. Please try again.
        </p>
      ) : (
        <>
          {warning === "expired" ? (
            <div className="term-banner term-banner-expired" role="alert">
              <WarningIcon className="term-banner-icon" size={20} />
              <div className="term-banner-body">
                <p className="term-banner-title">No term is set for today</p>
                <p className="term-banner-text">
                  P2 deadlines and touch point counts are falling back to the last 90 days. Add this
                  year's term dates to fix it.
                </p>
              </div>
            </div>
          ) : warning === "ending-soon" && !runwayDismissed ? (
            <div className="term-banner term-banner-runway" role="status">
              <WarningIcon className="term-banner-icon" size={20} />
              <div className="term-banner-body">
                <p className="term-banner-title">Term dates run out soon</p>
                <p className="term-banner-text">
                  The last term set up ends on {lastEnd ? formatSydneyDateWithYear(lastEnd) : ""}.
                  Add the next year's terms before then, or the P2 dates and touch point counts will
                  stop being accurate.
                </p>
              </div>
              <button
                type="button"
                className="term-banner-dismiss"
                aria-label="Dismiss this reminder"
                title="Dismiss this reminder"
                onClick={dismissRunway}
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}

          <ul className="stats-hero">
            {statTiles.map((tile) => (
              <li key={tile.label} className="stat-tile">
                <span className="stat-label">{tile.label}</span>
                <span className={`stat-value ${tile.cls}`}>{tile.value}</span>
              </li>
            ))}
          </ul>

          <div className="p2-progress">
            <div className="p2-progress-head">
              <span className="p2-progress-label">P2 progress this term</span>
              <span className="p2-progress-value">
                {stats.complete} of {stats.total} done
              </span>
            </div>
            <div
              className="p2-progress-track"
              role="progressbar"
              aria-label="P2 progress this term"
              aria-valuenow={stats.rate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${stats.rate} percent of active students are P2 done`}
            >
              <div className="p2-progress-fill" style={{ width: `${stats.rate}%` }} />
            </div>
          </div>

          <div className="tracker-header">
            <div className="tracker-header-main">
              <h2 className="section-heading">Parents</h2>
              <p className="tracker-subtitle">
                {sorted.length} active
                <span className="tracker-subtitle-dot" aria-hidden="true">
                  {"·"}
                </span>
                {term ? (
                  <>
                    {term.term_name}, P2 by {formatSydneyFullDate(term.p2_deadline ?? "")}
                    {daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 14 ? (
                      <span className="tracker-countdown">
                        {daysToDeadline} {daysToDeadline === 1 ? "day" : "days"},{" "}
                        {stats.outstanding} outstanding
                      </span>
                    ) : null}
                  </>
                ) : (
                  "no active term set"
                )}
              </p>
            </div>

            <div className="tracker-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="more-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More actions"
                title="More actions"
                onClick={() => setMenuOpen((current) => !current)}
              >
                <MoreIcon />
              </button>
              {menuOpen ? (
                <div className="action-menu" role="menu" aria-label="More actions">
                  <div className="action-menu-group">
                    <button
                      type="button"
                      role="menuitem"
                      className="action-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        void handleExport();
                      }}
                    >
                      Export first names
                      <PeopleIcon className="action-menu-icon" />
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="action-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        void handleExportEmails();
                      }}
                    >
                      Export emails for BCC
                      <AtIcon className="action-menu-icon" />
                    </button>
                  </div>
                  <div className="action-menu-group">
                    <button
                      type="button"
                      role="menuitem"
                      className="action-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setToolPanel((current) => (current === "sms" ? null : "sms"));
                      }}
                    >
                      SMS templates
                      <MessageIcon className="action-menu-icon" />
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="action-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setToolPanel((current) => (current === "email" ? null : "email"));
                      }}
                    >
                      Email templates
                      <MailIcon className="action-menu-icon" />
                    </button>
                  </div>
                  <div className="action-menu-group">
                    <button
                      type="button"
                      role="menuitem"
                      className="action-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setToolPanel((current) => (current === "help" ? null : "help"));
                      }}
                    >
                      How do I import students?
                      <HelpIcon className="action-menu-icon" size={15} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {mismatches.length > 0 ? (
            <>
              <button
                type="button"
                className="mismatch-banner"
                aria-expanded={mismatchOpen}
                aria-controls="mismatch-panel"
                onClick={() => setMismatchOpen((current) => !current)}
              >
                <WarningIcon className="mismatch-banner-icon" size={18} />
                <span className="mismatch-banner-text">
                  {mismatches.length === 1
                    ? "1 Calendly booking needs review"
                    : `${mismatches.length} Calendly bookings need review`}
                </span>
                <span className="mismatch-banner-action">{mismatchOpen ? "Hide" : "Review"}</span>
              </button>
              {mismatchOpen ? (
                <div id="mismatch-panel">
                  <MismatchPanel
                    mismatches={mismatches}
                    students={students ?? []}
                    onResolved={(id) =>
                      setMismatches((current) =>
                        current.filter((entry) => String(entry.id) !== String(id)),
                      )
                    }
                    onLogged={handleLogSaved}
                    onClose={() => setMismatchOpen(false)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <div className="search-pill">
            <SearchIcon className="search-pill-icon" />
            <input
              type="search"
              className="search-pill-input"
              placeholder="Search"
              aria-label="Search student or parent"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          {exportMessage ? (
            <p className="tracker-export-message" role="status">
              {exportMessage}
            </p>
          ) : null}

          {toolPanel ? (
            <div id="tracker-tool-panel">
              {toolPanel === "help" ? (
                <ImportHelpPanel onClose={() => setToolPanel(null)} />
              ) : toolPanel === "sms" ? (
                <TemplateManagerPanel
                  mode="sms"
                  templates={smsTemplates}
                  onTemplatesChange={setSmsTemplates}
                  onClose={() => setToolPanel(null)}
                />
              ) : (
                <TemplateManagerPanel
                  mode="email"
                  templates={emailTemplates}
                  onTemplatesChange={setEmailTemplates}
                  onClose={() => setToolPanel(null)}
                />
              )}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="tracker-message">
              {searchQuery.trim() ? "No students match that search." : "No active students yet."}
            </p>
          ) : (
            <div className="roster-table">
              <div className="roster-head" aria-hidden="true">
                <span className="col-student">Student</span>
                <span className="col-status">P2 status</span>
                <span className="col-touch">Touch points</span>
                <span className="col-actions" />
              </div>
              <ul className="roster-body">
                {filtered.map(({ student, status, done, overdue, focus }) => {
                  const statusLabel = STATUS_LABELS[status];
                  const openKind =
                    panel && panel.studentId === String(student.id) ? panel.kind : null;
                  const historyEntries =
                    openKind === "history"
                      ? logs.filter((log) => String(log.student_id) === String(student.id))
                      : [];
                  const touch = touchPointsByStudent.get(String(student.id));
                  const touchCount = touch?.count ?? 0;
                  const touchWord = touchCount === 1 ? "Touch point" : "Touch points";
                  const touchLabel = touch
                    ? `${touchCount} touch ${touchCount === 1 ? "point" : "points"}${
                        touch.latestDate ? `, latest ${formatSydneyFullDate(touch.latestDate)}` : ""
                      }`
                    : "";
                  // Green when done, red when overdue, amber when due this
                  // week, neutral otherwise.
                  const tone = done ? "good" : overdue ? "danger" : focus ? "warn" : "neutral";
                  const lastEntry = latestByStudent.get(String(student.id));
                  const lastContact =
                    lastEntry && lastEntry.date_contacted
                      ? `${shortMethod(lastEntry.method)}, ${formatSydneyShortDate(lastEntry.date_contacted)}`
                      : null;
                  const rowMenu = rowMenuId === String(student.id);
                  return (
                    <li
                      key={student.id}
                      className={`roster-row${overdue ? " is-overdue" : focus ? " is-focus" : ""}`}
                    >
                      <div className="col-student">
                        <p className="row-name">
                          {student.is_priority ? (
                            <StarIcon className="roster-star" size={12} />
                          ) : null}
                          <span className="row-name-text">{student.student_name}</span>
                        </p>
                        <p className="row-sub">
                          <span className="row-parent">
                            {student.parent_name ?? "No parent name"}
                          </span>
                          {student.parent_phone ? (
                            <span className="row-phone">{student.parent_phone}</span>
                          ) : null}
                        </p>
                      </div>

                      <div className="col-status">
                        <span className={`status-pill status-pill-${tone}`}>
                          <span className="status-dot" aria-hidden="true" />
                          {statusLabel}
                        </span>
                        {lastContact ? <span className="status-last">{lastContact}</span> : null}
                      </div>

                      <div className="col-touch">
                        {touchCount > 0 ? (
                          <button
                            type="button"
                            className="touch-badge"
                            aria-label={touchLabel}
                            title={touchLabel}
                            onClick={() => openPanel("touch", student.id)}
                          >
                            <MailIcon className="touch-badge-icon" size={13} />
                            <span className="touch-badge-count">{touchCount}</span>
                            <span className="touch-badge-label">{touchWord}</span>
                          </button>
                        ) : (
                          <span
                            className="touch-badge is-empty"
                            aria-label={`No touch points for ${student.student_name}`}
                          >
                            <MailIcon className="touch-badge-icon" size={13} />
                            <span className="touch-badge-count">0</span>
                            <span className="touch-badge-label">{touchWord}</span>
                          </span>
                        )}
                      </div>

                      <div className="col-actions">
                        <button
                          type="button"
                          className="row-log-button"
                          aria-label={`Log contact for ${student.student_name}`}
                          onClick={() => openPanel("log", student.id)}
                        >
                          <PlusIcon size={15} />
                          Log
                        </button>
                        <button
                          type="button"
                          className="row-square-button"
                          aria-label={`Contact history for ${student.student_name}`}
                          title="History"
                          onClick={() => openPanel("history", student.id)}
                        >
                          <HistoryIcon />
                        </button>
                        <div className="row-menu-wrap" ref={rowMenu ? rowMenuRef : undefined}>
                          <button
                            type="button"
                            className="row-square-button"
                            aria-haspopup="menu"
                            aria-expanded={rowMenu}
                            aria-label={`More actions for ${student.student_name}`}
                            title="More actions"
                            onClick={() =>
                              setRowMenuId((current) =>
                                current === String(student.id) ? null : String(student.id),
                              )
                            }
                          >
                            <MoreIcon size={16} />
                          </button>
                          {rowMenu ? (
                            <div
                              className="action-menu row-menu"
                              role="menu"
                              aria-label={`More actions for ${student.student_name}`}
                            >
                              <div className="action-menu-group">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="action-menu-item"
                                  disabled={!student.parent_phone}
                                  onClick={() => {
                                    setRowMenuId(null);
                                    openPanel("sms", student.id);
                                  }}
                                >
                                  {student.parent_phone ? "Send an SMS" : "No phone number"}
                                  <MessageIcon className="action-menu-icon" />
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="action-menu-item"
                                  disabled={!student.parent_email}
                                  onClick={() => {
                                    setRowMenuId(null);
                                    openPanel("email", student.id);
                                  }}
                                >
                                  {student.parent_email ? "Send an email" : "No email address"}
                                  <MailIcon className="action-menu-icon" />
                                </button>
                              </div>
                              <div className="action-menu-group">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="action-menu-item action-menu-item-danger"
                                  onClick={() => {
                                    setRowMenuId(null);
                                    openPanel("delete", student.id);
                                  }}
                                >
                                  Delete student
                                  <TrashIcon className="action-menu-icon" />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {openKind === "log" ? (
                        <LogContactPanel
                          studentId={student.id}
                          studentName={student.student_name}
                          onClose={() => setPanel(null)}
                          onSaved={handleLogSaved}
                        />
                      ) : null}
                      {openKind === "touch" && touch ? (
                        <div className="roster-panel">
                          <p className="roster-panel-title">
                            Touch points for {student.student_name}
                          </p>
                          <p className="roster-panel-text">
                            Notes taken on the Today screen. These do not count towards P2 and never
                            change the status badge.
                          </p>
                          <ul className="history-list">
                            {touch.entries.map((entry, index) => (
                              <li key={`${entry.date}-${index}`} className="history-entry">
                                <div className="history-details">
                                  <p className="history-line">
                                    {entry.date ? formatSydneyFullDate(entry.date) : "No date"}
                                    {entry.addedBy ? `, ${entry.addedBy}` : ""}
                                  </p>
                                  <p className="history-when">{entry.text}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <div className="roster-panel-actions">
                            <button
                              type="button"
                              className="row-button"
                              onClick={() => setPanel(null)}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {openKind === "sms" && student.parent_phone ? (
                        <TemplatePanel
                          mode="sms"
                          studentName={student.student_name}
                          parentName={student.parent_name}
                          target={student.parent_phone}
                          templates={smsTemplates}
                          onClose={() => setPanel(null)}
                        />
                      ) : null}
                      {openKind === "email" && student.parent_email ? (
                        <TemplatePanel
                          mode="email"
                          studentName={student.student_name}
                          parentName={student.parent_name}
                          target={student.parent_email}
                          templates={emailTemplates}
                          onClose={() => setPanel(null)}
                        />
                      ) : null}
                      {openKind === "history" ? (
                        <div className="roster-panel">
                          <p className="roster-panel-title">
                            Contact history for {student.student_name}
                          </p>
                          {historyEntries.length === 0 ? (
                            <p className="roster-panel-text">No contact logged yet.</p>
                          ) : (
                            <ul className="history-list">
                              {historyEntries.map((entry) => (
                                <li key={entry.id} className="history-entry">
                                  <div className="history-details">
                                    <p className="history-line">
                                      {entry.method ?? "Unknown"}, {entry.outcome ?? "unknown"}
                                    </p>
                                    <p className="history-when">
                                      {entry.date_contacted
                                        ? formatSydneyFullDate(entry.date_contacted)
                                        : "No date"}
                                      {entry.logged_at
                                        ? `, logged ${formatSydneyTime(entry.logged_at)}`
                                        : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="row-button row-button-danger"
                                    disabled={entryBusyId === entry.id}
                                    onClick={() => handleEntryDelete(entry)}
                                  >
                                    {entryBusyId === entry.id ? "Removing..." : "Delete"}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          {rowMessage ? (
                            <p className="roster-panel-message" role="alert">
                              {rowMessage}
                            </p>
                          ) : null}
                          <div className="roster-panel-actions">
                            <button
                              type="button"
                              className="row-button"
                              onClick={() => setPanel(null)}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {openKind === "delete" ? (
                        <div className="roster-panel">
                          <p className="roster-panel-title">Delete {student.student_name}?</p>
                          <p className="roster-panel-text">
                            This removes the student and their whole contact history. It cannot be
                            undone.
                          </p>
                          <input
                            className="text-field log-input delete-confirm-field"
                            type="text"
                            value={deleteConfirm}
                            placeholder="Type DELETE to confirm"
                            aria-label="Type DELETE to confirm"
                            onChange={(event) => {
                              setDeleteConfirm(event.target.value);
                              setRowMessage(null);
                            }}
                          />
                          {rowMessage ? (
                            <p className="roster-panel-message" role="alert">
                              {rowMessage}
                            </p>
                          ) : null}
                          <div className="roster-panel-actions">
                            <button
                              type="button"
                              className="row-button"
                              onClick={() => setPanel(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="primary-button roster-panel-save button-danger"
                              disabled={deletingStudent || deleteConfirm.trim() !== "DELETE"}
                              onClick={() => handleStudentDelete(student)}
                            >
                              {deletingStudent ? "Deleting..." : "Delete student"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
