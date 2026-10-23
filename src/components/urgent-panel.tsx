"use client";

import { useState, useTransition } from "react";
import { markUrgentDone, replyUrgent, sendUrgent, type UrgentTo } from "@/app/(app)/urgent-actions";
import { Sheet } from "./sheet";

type Reply = { author_id: string; text: string; at: string; name: string; mine: boolean };
export type UrgentNote = { id: string; body: string; to_role: UrgentTo; from_name: string; created_at: string; updated_at: string; mine: boolean; replies: Reply[] };
const TO_LABEL: Record<UrgentTo, string> = { owner: "מנהלת הסטודיו", manager: "מנהל/ת הלקוח", client: "הלקוח" };
const TO_FOR: Record<UrgentTo, string> = { owner: "למנהלת הסטודיו", manager: "למנהל/ת הלקוח", client: "ללקוח" };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "עכשיו" : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : `לפני ${Math.round(m / 1440)} ימים`;
};

// הודעות דחופות כשיחות: רשימת השיחות הפתוחות, שיחה עם תשובות וסגירה, ופתיחת שיחה חדשה
export function UrgentPanel({ clientId, threads, recipients }: { clientId: string; threads: UrgentNote[]; recipients: UrgentTo[] }) {
  const [to, setTo] = useState<UrgentTo | null>(null);
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const open = threads.find((t) => t.id === openId) ?? null;

  const send = () => start(async () => {
    if (!to || !text.trim()) return;
    const r = await sendUrgent(clientId, to, text);
    if (r.error) setMsg(r.error);
    else { setText(""); setTo(null); setMsg("נשלח ✓"); setTimeout(() => setMsg(""), 2000); }
  });

  if (!threads.length && !recipients.length) return null;
  return (
    <section className="sec urgent">
      {threads.length > 0 && <div className="label dotted">הודעות דחופות</div>}
      {threads.map((t) => {
        const last = t.replies.at(-1);
        return (
          <button key={t.id} className={`urgent-card${!t.mine && !t.replies.some((r) => r.mine) ? " new" : ""}`} onClick={() => setOpenId(t.id)}>
            <span className="urgent-ic" aria-hidden="true">!</span>
            <span className="urgent-body">
              <span className="txt">{t.mine ? `אל ${TO_LABEL[t.to_role]}` : `מאת ${t.from_name}`} · {ago(t.updated_at)}{t.replies.length ? ` · ${t.replies.length} תשובות` : ""}</span>
              <span className="urgent-preview">{last ? `${last.name}: ${last.text}` : t.body}</span>
            </span>
            <span className="urgent-go" aria-hidden="true">›</span>
          </button>
        );
      })}

      {recipients.length > 0 && (
        <div className="urgent-compose">
          {!to ? (
            <div className="urgent-to">
              <span className="txt">הודעה דחופה</span>
              {recipients.map((r) => <button key={r} className="chipbtn" onClick={() => setTo(r)}>{TO_FOR[r]}</button>)}
            </div>
          ) : (
            <form className="stack tight" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <span className="txt">הודעה דחופה {TO_FOR[to]} · תגיע כהתראה</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus aria-label="ההודעה" />
              <div className="acts2">
                <button type="button" className="tbtn" onClick={() => { setTo(null); setText(""); }}>ביטול</button>
                <button className="pbtn" disabled={pending || !text.trim()}>{pending ? "שולחים…" : "שליחה"}</button>
              </div>
            </form>
          )}
          {msg && <span className="txt">{msg}</span>}
        </div>
      )}

      {open && <Thread clientId={clientId} note={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function Thread({ clientId, note, onClose }: { clientId: string; note: UrgentNote; onClose: () => void }) {
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const all = [{ name: note.from_name, text: note.body, at: note.created_at, mine: note.mine }, ...note.replies];
  return (
    <Sheet onClose={onClose} label="הודעה דחופה" busy={pending}>
      <h2>הודעה דחופה</h2>
      <span className="txt">{note.mine ? `שיחה עם ${TO_LABEL[note.to_role]}` : `מאת ${note.from_name}`}</span>
      <div className="thread">
        {all.map((m, i) => (
          <div key={i} className={`bubble${m.mine ? " mine" : ""}`}>
            {!m.mine && <b className="bubble-name">{m.name}</b>}
            <p>{m.text}</p>
            <small>{ago(m.at)}</small>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); const t = reply; setReply(""); start(async () => { await replyUrgent(clientId, note.id, t); }); }}>
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="תשובה…" aria-label="תשובה" />
        <button className="send" disabled={pending || !reply.trim()} aria-label="שליחה">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
        </button>
      </form>
      <button className="tbtn close-thread" disabled={pending} onClick={() => start(async () => { await markUrgentDone(clientId, note.id); onClose(); })}>סגירת השיחה</button>
    </Sheet>
  );
}
