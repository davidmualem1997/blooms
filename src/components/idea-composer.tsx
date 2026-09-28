"use client";

import { useState, useTransition } from "react";
import { addIdea } from "@/app/(app)/c/[clientId]/inspiration/actions";
import { MONTHS } from "@/lib/dates";

const URL_RE = /(https?:\/\/\S+|(?:www\.|pin\.it\/|instagram\.com\/|tiktok\.com\/)\S+)/i;

// "רעיון לתוכן": טקסט חופשי או קישור לריל/פין, נשמר ישר בהשראה של הלקוח
export function IdeaComposer({ clients, today, isClient }: { clients: { id: string; name: string }[]; today: string; isClient: boolean }) {
  const [clientId, setClientId] = useState(clients[0]?.id);
  const [next, setNext] = useState(true);
  const [log, setLog] = useState<{ me: boolean; t: string }[]>([]);
  const [pending, start] = useTransition();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const thisMonth = today.slice(0, 7) + "-01";
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  function submit(fd: FormData) {
    const text = String(fd.get("t") ?? "").trim();
    if (!text || !clientId) return;
    const url = text.match(URL_RE)?.[0] ?? "";
    let title = text.replace(url, "").trim();
    if (!title) title = /pin/.test(url) ? "השראה מפינטרסט" : /tiktok/.test(url) ? "השראה מטיקטוק" : "השראה מאינסטגרם";
    const month = next ? nextMonth : thisMonth;
    const client = clients.find((c) => c.id === clientId)!;
    start(async () => {
      const res = await addIdea(clientId, month, {
        title: title.length > 60 ? title.slice(0, 57) + "…" : title,
        note: title.length > 60 ? title : "",
        url: url && !/^https?:/.test(url) ? `https://${url}` : url,
        image_path: null,
      });
      setLog((l) => [...l, { me: true, t: text }, {
        me: false,
        t: res.error ?? (isClient ? "תודה! הרעיון הגיע לצוות" : `נשמר בהשראה של ${client.name} · ${MONTHS[Number(month.slice(5, 7)) - 1]}`),
      }].slice(-6));
    });
  }

  return (
    <section className="sec">
      <div className="label dotted">רעיונות לתוכן</div>
      <div className="chat">
        <div className="msgs">
          {log.map((x, i) => <div key={i} className={`msg${x.me ? " me" : ""}`}>{x.t}</div>)}
        </div>
        <div className="seg small">
          {clients.length > 1 && clients.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === clientId} onClick={() => setClientId(c.id)}>{c.name}</button>
          ))}
          {clients.length > 1 && <span className="sepv" />}
          <button type="button" aria-pressed={!next} onClick={() => setNext(false)}>{MONTHS[m - 1]}</button>
          <button type="button" aria-pressed={next} onClick={() => setNext(true)}>{MONTHS[m % 12]}</button>
        </div>
        <form className="composer" action={submit} key={log.length}>
          <input name="t" placeholder={isClient ? "רעיון או קישור לריל שאהבתם" : "רעיון או קישור לריל / לפין"} aria-label="רעיון חדש" autoComplete="off" disabled={pending} />
          <button className="send" aria-label="שליחה" disabled={pending}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          </button>
        </form>
      </div>
    </section>
  );
}
