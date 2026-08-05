import { useEffect, useMemo, useState } from "react";
import type { PinGate } from "../hooks/usePinGate";
import { formatSydneyFullDate } from "../lib/dates";
import { deriveStatus, isP2Done, latestPerStudent, type ContactStatus } from "../lib/p2";
import { supabase } from "../lib/supabase";
import { LockGate } from "./LockGate";
import { StarIcon, TickIcon } from "./Icons";

type RosterStudent = {
  id: number | string;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  subject: string | null;
  is_priority: boolean | null;
};

type RosterLog = {
  student_id: number | string;
  method: string | null;
  outcome: string | null;
  logged_at: string | null;
};

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
  low_risk: { label: "Low Risk", cls: "badge-calm" },
  attempted: { label: "Attempted", cls: "badge-attempted" },
  sms: { label: "SMS Sent", cls: "badge-sms" },
  email: { label: "Email Sent", cls: "badge-email" },
  report: { label: "Report Sent", cls: "badge-report" },
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      const [studentsRes, logsRes, termRes, focusRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, student_name, parent_name, parent_phone, subject, is_priority")
          .eq("enrolment_status", "Active"),
        supabase
          .from("contact_log")
          .select("student_id, method, outcome, logged_at")
          .order("logged_at", { ascending: false }),
        supabase
          .from("term_settings")
          .select("term_name, term_start_date, p2_deadline")
          .eq("is_active", true)
          .order("p2_deadline", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("weekly_focus").select("parent_name, week_start"),
      ]);
      if (cancelled) return;
      if (studentsRes.error || logsRes.error || termRes.error || focusRes.error) {
        setLoadFailed(true);
        setStudents([]);
        return;
      }
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
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const latestByStudent = useMemo(() => latestPerStudent(logs), [logs]);

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
    return { complete, outstanding, overdue, rate, focus, week };
  }, [decorated, deadlinePassed, term]);

  const daysToDeadline = useMemo(() => {
    if (!term?.p2_deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(term.p2_deadline);
    deadline.setHours(0, 0, 0, 0);
    return Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  }, [term]);

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

          <div className="tracker-toolbar">
            <div className="tracker-title-block">
              <h2 className="section-heading">Parents</h2>
              {term ? (
                <p className="tracker-term">
                  {term.term_name}, P2 by {formatSydneyFullDate(term.p2_deadline ?? "")}
                  {daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 14 ? (
                    <span className="tracker-countdown">
                      {daysToDeadline} {daysToDeadline === 1 ? "day" : "days"}, {stats.outstanding}{" "}
                      outstanding
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="tracker-term">No active term set</p>
              )}
            </div>
            <div className="tracker-tools">
              <span className="tracker-count">{sorted.length} active</span>
              <div className="tracker-search">
                <input
                  type="search"
                  className="text-field tracker-search-field"
                  placeholder="Search student or parent"
                  aria-label="Search student or parent"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="tracker-message">
              {searchQuery.trim() ? "No students match that search." : "No active students yet."}
            </p>
          ) : (
            <ul className="roster-list">
              {filtered.map(({ student, status, done, overdue, focus }) => {
                const badge = BADGES[status];
                return (
                  <li
                    key={student.id}
                    className={`roster-item${overdue ? " is-overdue" : focus ? " is-focus" : ""}`}
                  >
                    <div className="roster-main">
                      <p className="roster-student">
                        {student.is_priority ? (
                          <StarIcon className="roster-star" size={13} />
                        ) : null}
                        {student.student_name}
                      </p>
                      <p className="roster-parent">
                        {student.parent_name ?? "No parent name"}
                        {student.parent_phone ? (
                          <span className="roster-phone"> {student.parent_phone}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="roster-badges">
                      <span className={`badge ${subjectClass(student.subject)}`}>
                        {student.subject ?? "No subject"}
                      </span>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      {overdue ? <span className="badge badge-danger">Overdue</span> : null}
                      {focus ? (
                        <span className="badge badge-highlight">Contact This Week</span>
                      ) : null}
                    </div>
                    <div className="roster-done">
                      {done ? (
                        <span className="roster-tick" aria-label="P2 done">
                          <TickIcon size={12} />
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
