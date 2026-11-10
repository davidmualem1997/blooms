"use client";

import { useState, useTransition } from "react";
import { mediaUrl } from "@/app/(app)/c/[clientId]/gantt/actions";
import { clientRequestEdit, clientRequestReply, updateRequest } from "@/app/(app)/c/[clientId]/requests/actions";
import { formatIL } from "@/lib/dates";
import { MESSAGE_LABEL, REQUEST_STATUS, type Message, type RequestStatus } from "@/lib/types";

const when = (iso: string) => { const { date, time } = formatIL(iso); return `${Number(date.slice(8))}.${Number(date.slice(5, 7))} · ${time}`; };
const STATUSES = Object.keys(REQUEST_STATUS) as RequestStatus[];

// כרטיס פנייה: סוג, זמן, טקסט, קבצים, סטטוס ותשובות הצוות. הצוות משנה סטטוס ומגיב – לא צ'אט פתוח
export function RequestCard({ clientId, m, thumbs, isStaff, author, names, me }: {
  clientId: string; m: Message; thumbs: Record<string, string>; isStaff: boolean; author?: string; names: Record<string, string>; me: string;
}) {
  const [pending, start] = useTransition();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  // הלקוח יכול להגיב ולערוך את הפנייה שלו כל עוד היא לא סומנה כסגורה
  const mineOpen = !isStaff && m.created_by === me && m.status !== "done";
  const who = (id: string) => names[id] || (id === m.created_by ? (id === me ? "אני" : author || "הלקוח") : "הצוות");
  return (
    <article className={`req ${m.status}`}>
      <div className="req-head">
        <span className={`tag kind-${m.kind}`}>{MESSAGE_LABEL[m.kind]}</span>
        <span className="txt num">{when(m.created_at)}{author ? ` · ${author}` : ""}</span>
        <span className={`rstatus ${m.status}`}>{REQUEST_STATUS[m.status]}{m.status === "done" ? " ✓" : ""}</span>
      </div>
      {editing ? (
        <form className="stack tight" action={(fd) => start(async () => {
          const r = await clientRequestEdit(clientId, m.id, String(fd.get("b") ?? ""));
          if (r.error) setErr(r.error); else { setErr(""); setEditing(false); }
        })}>
          <textarea name="b" rows={4} defaultValue={m.body} aria-label="הפנייה" required />
          <div className="acts2">
            <button type="button" className="tbtn" onClick={() => setEditing(false)}>ביטול</button>
            <button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירה"}</button>
          </div>
        </form>
      ) : <p className="pre">{m.body}</p>}
      {m.attachments.length > 0 && (
        <div className="media-strip">
          {m.attachments.map((a) => (
            <button key={a.path} type="button" className="mtile" onClick={async () => { const u = await mediaUrl(a.path); if (u) window.open(u, "_blank"); }} aria-label="הורדת הקובץ">
              {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני */}
              {a.thumb && thumbs[a.thumb] ? <img src={thumbs[a.thumb]} alt="" /> : <span className="mph">{a.kind === "video" ? "סרטון" : "קובץ"}</span>}
              <span className="mdl">הורדה</span>
            </button>
          ))}
        </div>
      )}
      {m.replies.map((r, i) => (
        <div key={i} className="reply">
          <b className="w500">{who(r.author_id)}</b>
          <span>{r.text}</span>
          <small className="num">{when(r.at)}</small>
        </div>
      ))}
      {mineOpen && !editing && (
        <div className="req-staff">
          {replying ? (
            <form className="composer" action={(fd) => start(async () => {
              const r = await clientRequestReply(clientId, m.id, String(fd.get("r") ?? ""));
              if (r.error) setErr(r.error); else { setErr(""); setReplying(false); }
            })}>
              <input name="r" placeholder="תגובה לצוות…" aria-label="תגובה" required />
              <button className="pbtn" disabled={pending}>שליחה</button>
            </form>
          ) : (
            <span className="row-gap">
              <button className="edit" onClick={() => setReplying(true)}>תגובה</button>
              <button className="edit" onClick={() => setEditing(true)}>עריכה</button>
            </span>
          )}
        </div>
      )}
      {err && <p className="txt">{err}</p>}
      {isStaff && (
        <div className="req-staff">
          <div className="seg small">
            {STATUSES.map((s) => (
              <button key={s} type="button" aria-pressed={m.status === s} disabled={pending} onClick={() => start(() => updateRequest(clientId, m.id, { status: s }))}>{REQUEST_STATUS[s]}</button>
            ))}
          </div>
          {replying ? (
            <form className="composer" action={(fd) => start(async () => {
              await updateRequest(clientId, m.id, { reply: String(fd.get("r") ?? ""), status: fd.get("close") ? "done" : undefined });
              setReplying(false);
            })}>
              <input name="r" placeholder="תשובה קצרה, למשל: הוספנו לתכנון של יום חמישי" aria-label="תשובה" required autoFocus />
              <label className="chk small"><input type="checkbox" name="close" defaultChecked /> לסגור כטופל</label>
              <button className="pbtn" disabled={pending}>שליחה</button>
            </form>
          ) : <button className="edit" onClick={() => setReplying(true)}>תשובה</button>}
        </div>
      )}
    </article>
  );
}
