"use client";

import { useState, useTransition } from "react";
import { markUrgentDone, sendUrgent, type UrgentTo } from "@/app/(app)/urgent-actions";

export type UrgentNote = { id: string; body: string; to_role: UrgentTo; from_name: string; created_at: string; mine: boolean };
const TO_LABEL: Record<UrgentTo, string> = { owner: "למנהלת הסטודיו", manager: "למנהל/ת הלקוח", client: "ללקוח" };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "עכשיו" : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : `לפני ${Math.round(m / 1440)} ימים`;
};

// הודעות דחופות בתוך לקוח: מה שנשלח אליי (עם "טופל"), ושליחה לנמען שבוחרים
export function UrgentPanel({ clientId, incoming, sent, recipients }: {
  clientId: string; incoming: UrgentNote[]; sent: UrgentNote[]; recipients: UrgentTo[];
}) {
  const [to, setTo] = useState<UrgentTo | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const send = () => start(async () => {
    if (!to || !text.trim()) return;
    const r = await sendUrgent(clientId, to, text);
    if (r.error) setMsg(r.error);
    else { setText(""); setTo(null); setMsg("נשלח ✓"); setTimeout(() => setMsg(""), 2000); }
  });

  if (!incoming.length && !recipients.length) return null;
  return (
    <section className="sec urgent">
      {incoming.length > 0 && (
        <>
          <div className="label dotted">הודעות דחופות</div>
          {incoming.map((n) => (
            <div key={n.id} className="urgent-card">
              <span className="urgent-ic" aria-hidden="true">!</span>
              <div className="urgent-body">
                <p>{n.body}</p>
                <span className="txt">{n.from_name} · {ago(n.created_at)}</span>
              </div>
              <button className="td-btn" onClick={() => start(() => markUrgentDone(clientId, n.id))} disabled={pending}>טופל</button>
            </div>
          ))}
        </>
      )}

      {recipients.length > 0 && (
        <div className="urgent-compose">
          {!to ? (
            <div className="urgent-to">
              <span className="txt">הודעה דחופה</span>
              {recipients.map((r) => <button key={r} className="chipbtn" onClick={() => setTo(r)}>{TO_LABEL[r]}</button>)}
            </div>
          ) : (
            <form className="stack tight" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <span className="txt">הודעה דחופה {TO_LABEL[to]} · תגיע כהתראה</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} autoFocus aria-label="ההודעה" />
              <div className="acts2">
                <button type="button" className="tbtn" onClick={() => { setTo(null); setText(""); }}>ביטול</button>
                <button className="pbtn" disabled={pending || !text.trim()}>{pending ? "שולחים…" : "שליחה"}</button>
              </div>
            </form>
          )}
          {msg && <span className="txt">{msg}</span>}
          {sent.length > 0 && (
            <div className="urgent-sent">
              {sent.map((n) => <span key={n.id} className="txt">↗ {TO_LABEL[n.to_role]}: {n.body.slice(0, 60)}{n.body.length > 60 ? "…" : ""} · {ago(n.created_at)}</span>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
