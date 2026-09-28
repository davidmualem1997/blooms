"use client";

import { useState, useTransition } from "react";
import { mediaUrl } from "@/app/(app)/c/[clientId]/gantt/actions";
import { updateRequest } from "@/app/(app)/c/[clientId]/requests/actions";
import { formatIL } from "@/lib/dates";
import { MESSAGE_LABEL, REQUEST_STATUS, type Message, type RequestStatus } from "@/lib/types";

const when = (iso: string) => { const { date, time } = formatIL(iso); return `${Number(date.slice(8))}.${Number(date.slice(5, 7))} · ${time}`; };
const STATUSES = Object.keys(REQUEST_STATUS) as RequestStatus[];

// כרטיס פנייה: סוג, זמן, טקסט, קבצים, סטטוס ותשובות הצוות. הצוות משנה סטטוס ומגיב – לא צ'אט פתוח
export function RequestCard({ clientId, m, thumbs, isStaff, author, names }: {
  clientId: string; m: Message; thumbs: Record<string, string>; isStaff: boolean; author?: string; names: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [replying, setReplying] = useState(false);
  return (
    <article className={`req ${m.status}`}>
      <div className="req-head">
        <span className={`tag kind-${m.kind}`}>{MESSAGE_LABEL[m.kind]}</span>
        <span className="txt num">{when(m.created_at)}{author ? ` · ${author}` : ""}</span>
        <span className={`rstatus ${m.status}`}>{REQUEST_STATUS[m.status]}{m.status === "done" ? " ✓" : ""}</span>
      </div>
      <p className="pre">{m.body}</p>
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
          <b className="w500">{names[r.author_id] || "הצוות"}</b>
          <span>{r.text}</span>
          <small className="num">{when(r.at)}</small>
        </div>
      ))}
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
