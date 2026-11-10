"use client";

import { useState, useTransition } from "react";
import { createWhatsAppCode, disconnectWhatsApp } from "./whatsapp-actions";

// הבוט בוואטסאפ: מכניסים לגאנט ושואלים שאלות ישר מהצ'אט
export function WhatsAppConnect({ linked, botNumber }: { linked: string | null; botNumber: string | null }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const text = `קוד חיבור ל-BLOOMS: ${code}`;

  return (
    <div className="card stack">
      <div className="label">וואטסאפ</div>
      {linked ? (
        <>
          <p className="txt">מחובר לבוט ✓ (המספר שמסתיים ב-{linked.slice(-4)}). אפשר לכתוב לבוט: &quot;תוסיף ריל לפיצהלה ביום חמישי בשש&quot;, לשלוח תמונה או הקלטה, או לשאול &quot;מה עולה השבוע?&quot;.</p>
          <span className="row-gap">
            {botNumber && <a className="tbtn" href={`https://wa.me/${botNumber}`} target="_blank" rel="noopener">פתיחת הצ&apos;אט</a>}
            <button className="tbtn" disabled={pending} onClick={() => start(() => disconnectWhatsApp())}>ניתוק</button>
          </span>
        </>
      ) : code ? (
        <>
          <p className="txt">שלחו לבוט את הקוד <b className="num" dir="ltr">{code}</b> מהטלפון שלכם. הקוד בתוקף ל-15 דקות.</p>
          {botNumber && <a className="pbtn" href={`https://wa.me/${botNumber}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">שליחה בוואטסאפ</a>}
          <button className="tbtn" onClick={() => window.location.reload()}>שלחתי – רענון</button>
        </>
      ) : (
        <>
          <p className="txt">מחברים את הוואטסאפ שלכם לבוט של BLOOMS, ואז אפשר להכניס תוכן לגאנט ולשאול שאלות ישר מהצ&apos;אט – בטקסט, בהקלטה או עם תמונה.</p>
          <button className="pbtn" disabled={pending} onClick={() => start(async () => {
            const r = await createWhatsAppCode();
            if (r.code) setCode(r.code); else setMsg(r.error ?? "");
          })}>חיבור לוואטסאפ</button>
        </>
      )}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}
