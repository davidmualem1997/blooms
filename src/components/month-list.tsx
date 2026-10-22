"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addFocus, deleteFocus, updateFocus } from "@/app/(app)/c/[clientId]/gantt/actions";

export type FocusItem = { id: string; text: string; done: boolean; url: string };
const fixUrl = (u: string) => (!u ? "" : /^https?:\/\//.test(u) ? u : `https://${u}`);

// רשימת משימות חודשית: "דגשים לחודש" (תוכן) או "רעיונות ודגשים שיווקיים" – עם סימון וקישור להשראה
export function MonthList({ clientId, month, kind, items, canEdit, title, placeholder }: {
  clientId: string; month: string; kind: "content" | "marketing"; items: FocusItem[]; canEdit: boolean; title: string; placeholder: string;
}) {
  const [, start] = useTransition();
  const [list, apply] = useOptimistic(items, (s, a: { id: string; done: boolean } | { add: FocusItem }) =>
    "add" in a ? [...s, a.add] : s.map((x) => (x.id === a.id ? { ...x, done: a.done } : x)));
  const [draft, setDraft] = useState("");
  const open = list.filter((x) => !x.done).length;

  // כמו "תזכורות" באייפון: השורה האחרונה ריקה – כותבים ולוחצים Enter. קישור בתוך הטקסט נשמר כקישור להשראה
  function add() {
    const raw = draft.trim();
    if (!raw) return;
    const url = raw.match(/https?:\/\/\S+/)?.[0] ?? "";
    const text = raw.replace(url, "").trim() || url;
    setDraft("");
    start(async () => { apply({ add: { id: `tmp-${Date.now()}`, text, done: false, url } }); await addFocus(clientId, month, text, kind, url); });
  }

  if (!canEdit && !list.length) return null;
  return (
    <section className="sec">
      <div className="sechead"><div className="label dotted">{title}{list.length > 0 && <span className="num"> · {open} פתוחים</span>}</div></div>
      <div className="note reminders">
        {list.map((f) => (
          <div key={f.id} className={`rem${f.done ? " done" : ""}`}>
            <button className="rem-dot" aria-pressed={f.done} aria-label={f.done ? "בוצע" : "סימון שבוצע"} disabled={!canEdit}
              onClick={() => start(async () => { apply({ id: f.id, done: !f.done }); await updateFocus(clientId, f.id, { done: !f.done }); })} />
            <span className="rem-text">
              {f.text}
              {f.url && <> <a className="edit" href={fixUrl(f.url)} target="_blank" rel="noopener">השראה ↗</a></>}
            </span>
            {canEdit && !f.id.startsWith("tmp-") && <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteFocus(clientId, f.id))}>×</button>}
          </div>
        ))}
        {canEdit && (
          <form className="rem new" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <span className="rem-dot" aria-hidden="true" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} placeholder="הוספה…" aria-label={`הוספה ל${title}. ${placeholder}`} enterKeyHint="done" />
          </form>
        )}
      </div>
    </section>
  );
}
