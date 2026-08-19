import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PinGate } from "../hooks/usePinGate";
import { copyText } from "../lib/clipboard";
import { formatSydneyFullDate, formatSydneyTime } from "../lib/dates";
import { deriveStatus, isP2Done, latestStatusEntryPerStudent, type ContactStatus } from "../lib/p2";
import { parentEmailPairs, parentFirstNames, type MessageTemplate } from "../lib/templates";
import { matchTouchPoints, type TouchPointNote } from "../lib/touchPoints";
import { supabase } from "../lib/supabase";
import { ImportHelpPanel } from "./ImportHelpPanel";
import { LockGate } from "./LockGate";
import { LogContactPanel, type SavedContactLog } from "./LogContactPanel";
import { TemplateManagerPanel } from "./TemplateManagerPanel";
import { TemplatePanel } from "./TemplatePanel";
import {
  AtIcon,
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

// With no active term row there is no term start to scope to, so the touch
// point read falls back to a rolling ninety day window, which is close
// enough to one term that the indicator means the same thing either way.
const TOUCH_POINT_FALLBACK_DAYS = 90;

function fallbackWindowStart(): string {
  const start = new Date();
  start.setDate(start.getDate() - TOUCH_POINT_FALLBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

type ActiveTerm = {
  term_name: string | null;
  term_start_date: string | null;
  p2_deadline: string | null;
};

type TrackerScreenProps = {
  pinGate: PinGate;
};

const BADGES: Record<ContactStatus, { label: string; cls: string }> = {
  none: { label: "No contact", cls: "badge-neutral" },
  p2_complete: { label: "P2 Complete", cls: "badge-success" },
  email_report: { label: "Email Report", cls: "badge-report" },
  low_risk: { label: "Low Risk", cls: "badge-calm" },
  attempted: { label: "Attempted", cls: "badge-attempted" },
  sms: { label: "SMS Sent", cls: "badge-sms" },
  light: { label: "Light Touch", cls: "badge-email" },
  // Filtered out before a badge is ever derived, so this label is a
  // fallback that should never appear on a row.
  touch_email: { label: "Touch Point Email", cls: "badge-neutral" },
};

function subjectClass(subject: string | null): string {
  const value = (subject ?? "").trim().toLowerCase();
  if (value === "maths") return "subject-maths";
  if (value === "english") return "subject-english";
  if (value === "both") return "subject-both";
  return "badge-neutral";
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
  const [term, setTerm] = useState<ActiveTerm | null>(null);
  const [focusNames, setFocusNames] = useState<Set<string>>(new Set());
  const [touchNotes, setTouchNotes] = useState<TouchPointNote[]>([]);
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

  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const loadRoster = useCallback(async () => {
    const [studentsRes, logsRes, termRes, focusRes] = await Promise.all([
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
      supabase
        .from("term_settings")
        .select("term_name, term_start_date, p2_deadline")
        .eq("is_active", true)
        .order("p2_deadline", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("weekly_focus").select("parent_name, week_start"),
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
    setTerm((termRes.data ?? null) as ActiveTerm | null);

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

    // Touch points are read, never written. Scoped to the current term when
    // one is set, otherwise to a rolling window.
    const term = (termRes.data ?? null) as ActiveTerm | null;
    const windowStart = term?.term_start_date ?? fallbackWindowStart();
    const notesRes = await supabase
      .from("daily_notes")
      .select("student_name, note_date, note_text, added_by")
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
  // recompute without a reload. The old tracker also watched
  // calendly_mismatches, which has no surface here yet.
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [unlocked, loadRoster]);

  // Touch points are filtered out here, so a badge only ever derives from
  // the most recent entry that is not a touch point.
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
                <span className="cell-student">Student</span>
                <span className="cell-parent">Parent</span>
                <span className="cell-subject">Subject</span>
                <span className="cell-status">Status</span>
                <span className="cell-actions">Actions</span>
              </div>
              <ul className="roster-body">
                {filtered.map(({ student, status, overdue, focus }) => {
                  const badge = BADGES[status];
                  const openKind =
                    panel && panel.studentId === String(student.id) ? panel.kind : null;
                  const historyEntries =
                    openKind === "history"
                      ? logs.filter((log) => String(log.student_id) === String(student.id))
                      : [];
                  const touch = touchPointsByStudent.get(String(student.id));
                  const touchLabel = touch
                    ? `${touch.count} touch ${touch.count === 1 ? "point" : "points"}${
                        touch.latestDate ? `, latest ${formatSydneyFullDate(touch.latestDate)}` : ""
                      }`
                    : "";
                  return (
                    <li
                      key={student.id}
                      className={`roster-row${overdue ? " is-overdue" : focus ? " is-focus" : ""}`}
                    >
                      <p className="cell-student">
                        {student.is_priority ? (
                          <StarIcon className="roster-star" size={12} />
                        ) : null}
                        <span className="cell-student-name">{student.student_name}</span>
                        {touch ? (
                          <button
                            type="button"
                            className="touch-chip"
                            aria-label={touchLabel}
                            title={touchLabel}
                            onClick={() => openPanel("touch", student.id)}
                          >
                            <span className="touch-chip-pill">{touch.count}</span>
                          </button>
                        ) : null}
                      </p>
                      <p className="cell-parent">
                        <span className="cell-parent-name">
                          {student.parent_name ?? "No parent name"}
                        </span>
                        {student.parent_phone ? (
                          <span className="cell-phone">{student.parent_phone}</span>
                        ) : null}
                      </p>
                      <p className="cell-subject">
                        <span className={`badge ${subjectClass(student.subject)}`}>
                          {student.subject ?? "None"}
                        </span>
                      </p>
                      <div className="cell-status">
                        <span
                          className={`badge subject-in-status ${subjectClass(student.subject)}`}
                        >
                          {student.subject ?? "None"}
                        </span>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        {overdue ? <span className="badge badge-danger">Overdue</span> : null}
                        {focus ? <span className="badge badge-highlight">This Week</span> : null}
                      </div>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="icon-button icon-button-primary"
                          aria-label={`Log contact for ${student.student_name}`}
                          title="Log contact"
                          onClick={() => openPanel("log", student.id)}
                        >
                          <PlusIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-quiet"
                          aria-label={
                            student.parent_phone
                              ? `Send an SMS about ${student.student_name}`
                              : `No phone number for ${student.student_name}`
                          }
                          title={student.parent_phone ? "Send SMS" : "No phone number"}
                          disabled={!student.parent_phone}
                          onClick={() => openPanel("sms", student.id)}
                        >
                          <MessageIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-quiet"
                          aria-label={
                            student.parent_email
                              ? `Email about ${student.student_name}`
                              : `No email address for ${student.student_name}`
                          }
                          title={student.parent_email ? "Send email" : "No email address"}
                          disabled={!student.parent_email}
                          onClick={() => openPanel("email", student.id)}
                        >
                          <MailIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-quiet"
                          aria-label={`Contact history for ${student.student_name}`}
                          title="History"
                          onClick={() => openPanel("history", student.id)}
                        >
                          <HistoryIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button-danger"
                          aria-label={`Delete ${student.student_name}`}
                          title="Delete student"
                          onClick={() => openPanel("delete", student.id)}
                        >
                          <TrashIcon />
                        </button>
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
