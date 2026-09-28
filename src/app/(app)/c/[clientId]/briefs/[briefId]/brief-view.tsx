"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/admin-ui";
import { deleteBrief, toggleEquipment, type BriefInput } from "../actions";
import { BriefForm } from "../brief-form";

// תצוגת בריף: כל מה שצריך ליום הצילום, עם רשימת ציוד לסימון והעתקה לשליחה בוואטסאפ
export function BriefView({ clientId, brief, when, canEdit, editing }: { clientId: string; brief: BriefInput & { id: string }; when: string; canEdit: boolean; editing: boolean }) {
  const [, start] = useTransition();
  const [equipment, flip] = useOptimistic(brief.equipment, (s, i: number) => s.map((e, j) => (j === i ? { ...e, done: !e.done } : e)));
  const [copied, setCopied] = useState(false);

  if (editing && canEdit) return (<><h1 className="display-title">עריכת בריף</h1><BriefForm clientId={clientId} brief={brief} /></>);

  const text = [
    `*${brief.title}*`, [when, brief.time_text].filter(Boolean).join(" | "), brief.location && `לוקיישן: ${brief.location}`, "",
    brief.goal, brief.feeling && `התחושה הרצויה: ${brief.feeling}`, "",
    brief.shots.length ? "סרטונים ותמונות:\n" + brief.shots.map((s, i) => `${i + 1}. ${s.text}`).join("\n") : "", "",
    brief.equipment.length ? "ציוד:\n" + brief.equipment.map((e) => `• ${e.text}${e.who ? ` – ${e.who}` : ""}`).join("\n") : "",
    brief.wardrobe && `\nלבוש: ${brief.wardrobe}`, brief.schedule && `\nלוחות זמנים:\n${brief.schedule}`,
    brief.participants && `\nמגיעים: ${brief.participants}`,
  ].filter((x): x is string => typeof x === "string").join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return (
    <article className="brief">
      <h1 className="display-title">{brief.title}</h1>
      <div className="brief-meta">
        {when && <span className="hchip">{when}</span>}
        {brief.time_text && <span className="hchip num">{brief.time_text}</span>}
        {brief.location && <span className={`hchip${/להחליט/.test(brief.location) ? " warn" : ""}`}>{brief.location}</span>}
      </div>
      {brief.goal && <p className="pre lead">{brief.goal}</p>}
      {brief.feeling && <p className="txt big">התחושה הרצויה: <b className="w500">{brief.feeling}</b></p>}

      {brief.shots.length > 0 && (
        <section className="sec"><div className="label dotted">סרטונים ותמונות</div>
          <ol className="shots">{brief.shots.map((s, i) => <li key={i}>{s.text}</li>)}</ol>
        </section>
      )}
      {equipment.length > 0 && (
        <section className="sec"><div className="sechead"><div className="label dotted">ציוד</div><span className="txt num">{equipment.filter((e) => e.done).length}/{equipment.length} מוכן</span></div>
          <div className="note">
            {equipment.map((e, i) => (
              <div key={i} className={`task${e.done ? " done" : ""}`}>
                <button className="box" aria-pressed={e.done} aria-label="מוכן" disabled={!canEdit}
                  onClick={() => start(async () => { flip(i); await toggleEquipment(clientId, brief.id, i); })}>✓</button>
                <span className="tt">{e.text}</span>
                {e.who ? <span className="tag">{e.who}</span> : <span />}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="two sec">
        {brief.wardrobe && <div className="card"><div className="label dotted">לבוש</div><p className="pre">{brief.wardrobe}</p></div>}
        {brief.schedule && <div className="card"><div className="label dotted">לוחות זמנים</div><p className="pre">{brief.schedule}</p></div>}
        {brief.participants && <div className="card"><div className="label dotted">מי מגיע</div><p className="pre">{brief.participants}</p></div>}
        {brief.links && <div className="card"><div className="label dotted">השראות</div><p className="pre linkify">{brief.links.split(/\s+/).map((w, i) => /^https?:\/\//.test(w) ? <a key={i} className="edit" href={w} target="_blank" rel="noopener">{w.replace(/^https?:\/\//, "").slice(0, 40)} </a> : `${w} `)}</p></div>}
      </div>

      <div className="acts2 sec">
        {canEdit ? (
          <span className="row-gap">
            <Link className="tbtn" href="?edit=1">עריכה</Link>
            <ConfirmButton label="מחיקה" title="למחוק את הבריף?" body="הבריף יימחק לכל הצוות." confirmLabel="כן, למחוק" onConfirm={deleteBrief.bind(null, clientId, brief.id)} />
          </span>
        ) : <span />}
        <span className="row-gap">
          <a className="tbtn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">שליחה בוואטסאפ</a>
          <button className="pbtn" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}>{copied ? "הועתק" : "העתקת הבריף"}</button>
        </span>
      </div>
    </article>
  );
}
