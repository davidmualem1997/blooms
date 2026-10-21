"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "./sheet";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGEST: Record<string, string[]> = {
  owner: ["מה דורש טיפול היום?", "מה מחכה לאישור של לקוחות?", "מה עולה מחר אצל כל הלקוחות?", "איך מזמינים מישהו לצוות?"],
  manager: ["מה עולה היום אצל הלקוחות שלי?", "יש פניות פתוחות?", "תציע 3 רעיונות לפוסט לפי תיק הלקוח", "איך שולחים תוכן לאישור הלקוח?"],
  client: ["מה מחכה לאישור שלי?", "מה עולה השבוע?", "איך שולחים בקשה לצוות?", "איך מאשרים תוכן?"],
};

// טקסט עם **הדגשה** וקישורים [טקסט](/נתיב) – רק קישורים פנימיים הופכים ללחיצים
function Rich({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} className={/^\s*([-•*]|\d+[.)])\s/.test(line) ? "ai-li" : undefined}>
          {line.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).map((part, j) => {
            const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (link) return link[2].startsWith("/") ? <Link key={j} href={link[2]} className="edit" onClick={onNavigate}>{link[1]}</Link> : <span key={j}>{link[1]}</span>;
            const bold = part.match(/^\*\*([^*]+)\*\*$/);
            return bold ? <b key={j}>{bold[1]}</b> : <span key={j}>{part.replace(/^\s*[-*]\s/, "• ")}</span>;
          })}
        </p>
      ))}
    </>
  );
}

// עוזר ה-AI: כפתור ✦ בשורה העליונה שפותח צ'אט
export function Assistant({ role }: { role: "owner" | "manager" | "client" }) {
  const pathname = usePathname();
  const clientId = pathname.match(/^\/c\/([^/]+)/)?.[1];
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...msgs, { role: "user" as const, content: question }];
    setMsgs(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, clientId }) });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? "משהו השתבש");
      else setMsgs([...next, { role: "assistant", content: data.text }]);
    } catch {
      setError("אין חיבור. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="bell ai-btn" onClick={() => setOpen(true)} aria-label="עוזר AI">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="עוזר BLOOMS">
          <div className="ai">
            <div className="ai-head">
              <h2>איך אפשר לעזור?</h2>
              {msgs.length > 0 && <button className="tbtn" onClick={() => { setMsgs([]); setError(""); }}>שיחה חדשה</button>}
            </div>
            {!msgs.length && (
              <div className="ai-sugg">
                {SUGGEST[role].map((s) => <button key={s} className="chipbtn" onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
            <div className="ai-msgs" aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={`ai-msg ${m.role}`}>
                  {m.role === "assistant" ? <Rich text={m.content} onNavigate={() => setOpen(false)} /> : m.content}
                </div>
              ))}
              {busy && <div className="ai-msg assistant typing" aria-label="חושב"><i /><i /><i /></div>}
              {error && <p className="error">{error}</p>}
              <div ref={end} />
            </div>
            <form className="composer ai-composer" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="שאלה על האפליקציה או על הלקוחות…" aria-label="שאלה" />
              <button className="send" disabled={busy || !draft.trim()} aria-label="שליחה">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
              </button>
            </form>
            <span className="txt ai-note">העוזר רואה רק את מה שמותר לך לראות, ולא משנה כלום. כדאי לבדוק מידע חשוב.</span>
          </div>
        </Sheet>
      )}
    </>
  );
}
