"use client";

import { useState, useTransition } from "react";
import { reviewItem } from "@/app/(app)/c/[clientId]/inspiration/actions";
import { sendRequest } from "@/app/(app)/c/[clientId]/requests/actions";
import { parseISODate, shortDate } from "@/lib/dates";
import { STATUS_LABEL, TYPE_LABEL, type ContentItem } from "@/lib/types";
import { Sheet } from "./sheet";
import { MediaStrip } from "./today-detail";

const WD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const dayLabel = (d: string) => `${WD[parseISODate(d).getUTCDay()]} ${shortDate(d)}`;

// הלקוח לוחץ על פוסט בפיד: רואה את כל הפרטים, ויכול לאשר, לבקש תיקון או להוסיף הערה לצוות
export function ClientItemSheet({ clientId, item, urls, onClose }: { clientId: string; item: ContentItem; urls: Record<string, string>; onClose: () => void }) {
  const waiting = item.status === "client";
  const [writing, setWriting] = useState(false);
  const [sent, setSent] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const status = item.status === "live" ? "עלה ✓" : item.status === "ok" ? "מאושר · מתוזמן" : STATUS_LABEL[item.status];

  const send = (note: string) => start(async () => {
    setErr("");
    if (waiting) {
      await reviewItem(clientId, item.id, false, note);
      setSent("התיקון נשלח לצוות ✓");
    } else {
      const r = await sendRequest(clientId, "fix", `לגבי "${item.title}" (${TYPE_LABEL[item.type]}, ${dayLabel(item.date)}): ${note}`);
      if (r.error) return setErr(r.error);
      setSent("ההערה נשלחה לצוות ✓ אפשר לעקוב אחריה בפניות");
    }
    setWriting(false);
  });

  return (
    <Sheet onClose={onClose} label={item.title} busy={pending}>
      <MediaStrip media={item.media} urls={urls} tall={item.type === "reel" || item.type === "tiktok"} />
      <h2>{item.title || TYPE_LABEL[item.type]}</h2>
      <div className="txt num">{TYPE_LABEL[item.type]} · {dayLabel(item.date)}{item.time ? ` · ${item.time.slice(0, 5)}` : ""} · {status}</div>
      {item.caption && <p className="pre">{item.caption}</p>}

      {sent ? <span className="used-tag">{sent}</span> : writing ? (
        <form className="stack tight" action={(fd) => send(String(fd.get("note") ?? "").trim())}>
          <textarea name="note" rows={3} placeholder={waiting ? "מה לתקן? למשל: להחליף את התמונה השנייה" : "ההערה שלך לצוות על הפוסט הזה"} aria-label="הערה" required />
          <div className="acts2">
            <button type="button" className="tbtn" onClick={() => setWriting(false)}>ביטול</button>
            <button className="pbtn" disabled={pending}>{pending ? "שולחים…" : "שליחה"}</button>
          </div>
        </form>
      ) : waiting ? (
        <div className="acts2">
          <button className="tbtn" onClick={() => setWriting(true)} disabled={pending}>יש לי תיקון</button>
          <button className="pbtn" disabled={pending} onClick={() => start(async () => { await reviewItem(clientId, item.id, true); setSent(`"${item.title}" אושר ✓`); })}>{pending ? "רגע…" : "מאשר/ת"}</button>
        </div>
      ) : (
        <button className="tbtn" onClick={() => setWriting(true)}>הוספת הערה או תיקון</button>
      )}
      {err && <p className="txt">{err}</p>}
    </Sheet>
  );
}
