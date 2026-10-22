"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addFocus, deleteFocus, updateFocus } from "@/app/(app)/c/[clientId]/gantt/actions";
import { Sheet } from "./sheet";

export type FocusItem = { id: string; text: string; done: boolean; url: string };
const fixUrl = (u: string) => (!u ? "" : /^https?:\/\//.test(u) ? u : `https://${u}`);

// רשימת משימות חודשית: "דגשים לחודש" (תוכן) או "רעיונות ודגשים שיווקיים" – עם סימון וקישור להשראה
export function MonthList({ clientId, month, kind, items, canEdit, title, placeholder }: {
  clientId: string; month: string; kind: "content" | "marketing"; items: FocusItem[]; canEdit: boolean; title: string; placeholder: string;
}) {
  const [, start] = useTransition();
  const [list, apply] = useOptimistic(items, (s, a: { id: string; done: boolean }) => s.map((x) => (x.id === a.id ? { ...x, done: a.done } : x)));
  const [adding, setAdding] = useState(false);
  const open = list.filter((x) => !x.done).length;

  return (
    <section className="sec">
      <div className="sechead">
        <div className="label dotted">{title}{list.length > 0 && <span className="num"> · {open} פתוחים</span>}</div>
        {canEdit && <button className="addbtn" onClick={() => setAdding(true)} aria-label={`הוספה ל${title}`}>+</button>}
      </div>
      {list.length > 0 && (
        <div className="note">
          {list.map((f) => (
            <div key={f.id} className={`task${f.done ? " done" : ""}`}>
              <button className="box" aria-pressed={f.done} aria-label="סומן" disabled={!canEdit}
                onClick={() => start(async () => { apply({ id: f.id, done: !f.done }); await updateFocus(clientId, f.id, { done: !f.done }); })}>✓</button>
              <span className="tt">
                {f.text}
                {f.url && <> · <a className="edit" href={fixUrl(f.url)} target="_blank" rel="noopener">השראה</a></>}
              </span>
              {canEdit ? <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteFocus(clientId, f.id))}>×</button> : <span />}
            </div>
          ))}
        </div>
      )}
      {adding && (
        <Sheet onClose={() => setAdding(false)} label={title}>
          <form className="stack" action={(fd) => start(async () => {
            await addFocus(clientId, month, String(fd.get("t") ?? ""), kind, String(fd.get("u") ?? ""));
            setAdding(false);
          })}>
            <h2>{title}</h2>
            <input name="t" placeholder={placeholder} aria-label={placeholder} autoFocus required />
            <input name="u" dir="ltr" placeholder="קישור להשראה (לא חובה)" aria-label="קישור להשראה" />
            <div className="acts2"><span /><button className="pbtn">הוספה</button></div>
          </form>
        </Sheet>
      )}
    </section>
  );
}
