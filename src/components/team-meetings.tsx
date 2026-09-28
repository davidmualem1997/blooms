"use client";

import { useState, useTransition } from "react";
import { addTeamTopic, deleteTeamMeeting, removeTeamTopic, saveTeamSummary, scheduleTeamMeeting, toggleTeamTopic } from "@/app/(app)/team-actions";
import { MONTHS, WEEKDAYS, formatIL, parseISODate } from "@/lib/dates";
import type { TeamMeeting } from "@/lib/types";
import { Avatar } from "./avatar";
import { Sheet } from "./sheet";

type Member = { id: string; full_name: string; avatar: string | null; role: "owner" | "manager" };
const KIND = { meet: "פגישה", call: "שיחה", zoom: "זום" } as const;

export function TeamMeetings({ meetings, team, isOwner, today, compact = false }: { meetings: TeamMeeting[]; team: Member[]; isOwner: boolean; today: string; compact?: boolean }) {
  const [scheduling, setScheduling] = useState(false);
  const [agenda, setAgenda] = useState(false);
  const [summary, setSummary] = useState<TeamMeeting | null>(null);
  const [, start] = useTransition();
  const sorted = [...meetings].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = sorted.filter((m) => !m.summary && formatIL(m.starts_at).date >= today);
  const past = sorted.filter((m) => !upcoming.includes(m)).reverse();
  const managers = team.filter((t) => t.role === "manager");
  // בדאשבורד של מנהלת הסטודיו: מוצג רק כשיש פגישה קרובה, עם 3 נושאים ראשונים
  if (compact && !upcoming.length) return null;

  return (
    <section className="sec">
      <div className="sechead">
        <div className="label dotted">{compact ? "פגישה קרובה" : "פגישות צוות"}</div>
        {isOwner && managers.length > 0 && <button className="edit" onClick={() => setScheduling(true)}>קביעת פגישה</button>}
      </div>
      {upcoming.map((m) => {
        const { date, time } = formatIL(m.starts_at);
        const d = parseISODate(date);
        return (
          <div key={m.id} className="bigcard mint">
            <div className="bc-top">
              <span className="bc-icon">☏</span>
              <span className="apeople">{m.attendee_ids.map((id) => { const t = team.find((x) => x.id === id); return t ? <Avatar key={id} src={t.avatar} name={t.full_name} size={34} /> : null; })}</span>
            </div>
            <div className="bc-title">פגישת צוות</div>
            <div className="txt">יום {WEEKDAYS[d.getUTCDay()]}, {d.getUTCDate()} ב{MONTHS[d.getUTCMonth()]} · {time} · {KIND[m.kind]}{m.location ? ` · ${m.location}` : ""}</div>
            <div className="topics">
              {(compact && !agenda ? m.topics.slice(0, 3) : m.topics).map((t, i) => (
                <div key={i} className={`task${t.done ? " done" : ""}`}>
                  <button className="box" aria-pressed={t.done} aria-label="סומן" onClick={() => start(() => toggleTeamTopic(m.id, i))}>✓</button>
                  <span className="tt">{t.text}</span>
                  <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => removeTeamTopic(m.id, i))}>×</button>
                </div>
              ))}
              {compact && !agenda && m.topics.length > 3 && <button className="edit" onClick={() => setAgenda(true)}>לפתוח את כל האג׳נדה ({m.topics.length})</button>}
              {(!compact || agenda) && <form className="addrow" action={(fd) => start(() => addTeamTopic(m.id, String(fd.get("t") ?? "")))}>
                <input name="t" placeholder="נקודה או משימה לדבר עליה" aria-label="נושא חדש" autoComplete="off" />
              </form>}
              {compact && !agenda && m.topics.length <= 3 && <button className="edit" onClick={() => setAgenda(true)}>לפתוח את האג׳נדה</button>}
            </div>
            {isOwner && (
              <div className="acts2">
                <button className="tbtn danger" onClick={() => start(() => deleteTeamMeeting(m.id))}>ביטול</button>
                <button className="pbtn" onClick={() => setSummary(m)}>סיכום פגישה</button>
              </div>
            )}
          </div>
        );
      })}
      {!compact && !upcoming.length && <p className="empty">{isOwner ? (managers.length ? "אין פגישת צוות קרובה" : "כשיהיו מנהלי לקוחות בצוות, אפשר יהיה לקבוע איתם פגישות כאן") : "אין פגישת צוות קרובה"}</p>}
      {!compact && past.length > 0 && (
        <details className="acc">
          <summary>סיכומי פגישות קודמות ({past.length})</summary>
          <div className="accb">
            {past.map((m) => (
              <div key={m.id} className="mpast">
                <b className="w500">{formatIL(m.starts_at).date.split("-").reverse().slice(0, 2).join(".")} · {m.attendee_ids.map((id) => team.find((t) => t.id === id)?.full_name).filter(Boolean).join(", ")}</b>
                {m.summary ? <p className="pre">{m.summary}</p> : <span className="txt">אין סיכום</span>}
                {isOwner && <button className="edit" onClick={() => setSummary(m)}>{m.summary ? "עריכת סיכום" : "הוספת סיכום"}</button>}
              </div>
            ))}
          </div>
        </details>
      )}

      {scheduling && <ScheduleSheet managers={managers} today={today} onClose={() => setScheduling(false)} />}
      {summary && (
        <Sheet onClose={() => setSummary(null)} label="סיכום פגישה">
          <form className="stack" action={(fd) => start(async () => { await saveTeamSummary(summary.id, String(fd.get("s") ?? "").trim()); setSummary(null); })}>
            <h2>סיכום פגישת צוות</h2>
            <textarea name="s" rows={9} defaultValue={summary.summary} placeholder="מה סוכם, מי אחראי על מה, עד מתי" />
            <div className="acts2"><span /><button className="pbtn">שמירה</button></div>
          </form>
        </Sheet>
      )}
    </section>
  );
}

function ScheduleSheet({ managers, today, onClose }: { managers: Member[]; today: string; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(managers.map((m) => m.id));
  const [kind, setKind] = useState<"meet" | "call" | "zoom">("meet");
  const [pending, start] = useTransition();
  return (
    <Sheet onClose={onClose} label="קביעת פגישת צוות" busy={pending}>
      <form className="stack" action={(fd) => start(async () => {
        await scheduleTeamMeeting({
          date: String(fd.get("date")) || today, time: String(fd.get("time")) || "10:00", kind, location: String(fd.get("where") ?? ""),
          attendees: picked, topics: String(fd.get("topics") ?? "").split("\n").map((s) => s.trim()),
        });
        onClose();
      })}>
        <h2>קביעת פגישת צוות</h2>
        <div className="field"><span className="label">עם מי</span>
          <div className="seg">{managers.map((m) => (
            <button key={m.id} type="button" aria-pressed={picked.includes(m.id)}
              onClick={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}>{m.full_name}</button>
          ))}</div>
        </div>
        <div className="field"><span className="label">סוג</span>
          <div className="seg">{(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND[k]}</button>
          ))}</div>
        </div>
        <div className="two"><label className="field"><span className="label">תאריך</span><input type="date" name="date" defaultValue={today} /></label>
          <label className="field"><span className="label">שעה</span><input type="time" name="time" defaultValue="10:00" /></label></div>
        <label className="field"><span className="label">מקום או קישור</span><input name="where" /></label>
        <label className="field"><span className="label">נקודות ומשימות לדבר עליהן (שורה לכל אחת)</span><textarea name="topics" rows={4} /></label>
        <div className="acts2"><span /><button className="pbtn" disabled={pending || !picked.length}>קביעה</button></div>
      </form>
    </Sheet>
  );
}

// כפתור קטן לקביעת פגישת צוות (כשהאזור עצמו מוסתר)
export function ScheduleTeamMeeting({ team, today }: { team: Member[]; today: string }) {
  const [open, setOpen] = useState(false);
  const managers = team.filter((t) => t.role === "manager");
  if (!managers.length) return null;
  return (
    <>
      <button className="edit" onClick={() => setOpen(true)}>+ פגישת צוות</button>
      {open && <ScheduleSheet managers={managers} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}
