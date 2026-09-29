"use client";

import { Chevron } from "@/components/chevron";

import { useState, useTransition } from "react";
import { ItemEditor, type EditorTarget } from "@/components/item-editor";
import { MonthList, type FocusItem } from "@/components/month-list";
import { Sheet } from "@/components/sheet";
import { MONTHS, WEEKDAYS, parseISODate } from "@/lib/dates";
import { STATUS_LABEL, TYPE_LABEL, type ClientEvent, type ContentItem, type ContentStatus, type OneOffStory, type RecurringStory } from "@/lib/types";
import type { CalEvent } from "@/lib/holidays";
import { addClientEvent, addOneOff, addRecurring, deleteClientEvent, deleteOneOff, deleteRecurring, setRecurringDays, setStoryDoneOn } from "./actions";

type Props = {
  clientId: string; studioId: string; thumbs: Record<string, string>; month: string; today: string; canEdit: boolean;
  items: ContentItem[]; recurring: RecurringStory[]; oneOff: OneOffStory[]; checks: string[]; focus: FocusItem[];
  special: CalEvent[]; custom: ClientEvent[];
  openItem?: string; // מהתראה: פותח את הפריט ישר
};

const WD_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export function GanttBoard(p: Props) {
  const [day, setDay] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(() => {
    const it = p.canEdit && p.openItem ? p.items.find((i) => i.id === p.openItem) : undefined;
    return it ? { item: it, date: it.date } : null;
  });
  const [, start] = useTransition();

  const first = parseISODate(p.month);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${p.month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
  const storiesOn = (d: string) => {
    const wd = parseISODate(d).getUTCDay();
    return [
      ...p.recurring.filter((s) => s.weekdays.includes(wd)).map((s) => ({ ref: `r:${s.id}`, title: s.title, oneOffId: null as string | null })),
      ...p.oneOff.filter((s) => s.date === d).map((s) => ({ ref: `o:${s.id}`, title: s.title, oneOffId: s.id })),
    ];
  };

  return (
    <>
      <MonthList clientId={p.clientId} month={p.month} kind="content" items={p.focus} canEdit={p.canEdit}
        title="דגשים לחודש" placeholder="דגש חדש לחודש" />

      <div className="cal">
        {WEEKDAYS.map((w) => <div key={w} className="wd">{w.slice(0, 3)}</div>)}
        {Array.from({ length: first.getUTCDay() }, (_, i) => <div key={`b${i}`} className="cell blank" />)}
        {dates.map((d) => {
          const its = p.items.filter((i) => i.date === d);
          const ss = storiesOn(d);
          return (
            <button key={d} className={`cell${d === p.today ? " today" : ""}${d < p.today ? " past" : ""}`} onClick={() => setDay(d)}
              aria-label={`${Number(d.slice(8))} ב${MONTHS[first.getUTCMonth()]}`}>
              <span className="d num">{Number(d.slice(8))}</span>
              {p.special.filter((e) => e.date === d).map((e) => <span key={e.title} className={`hday ${e.kind}`}>{e.title}</span>)}
              {p.custom.filter((e) => e.date === d).map((e) => <span key={e.id} className="hday custom">★ {e.title}</span>)}
              {its.map((i) => (
                <span key={i.id} className={`ev${i.type === "tiktok" ? " tt" : ""}`} style={{ ["--c" as string]: `var(--s-${i.status})` }}>
                  <b>{TYPE_LABEL[i.type]}</b> – {i.title}
                </span>
              ))}
              {ss.map((x) => <span key={x.ref} className={`stl${x.oneOffId ? " one" : ""}`}>סטורי · {x.title}</span>)}
            </button>
          );
        })}
      </div>
      <div className="legend">
        {(Object.keys(STATUS_LABEL) as ContentStatus[]).map((s) => (
          <span key={s}><span className="sdot" style={{ ["--c" as string]: `var(--s-${s})` }} />{STATUS_LABEL[s]}</span>
        ))}
        <span><span className="hsw ig" />אינסטגרם</span>
        <span><span className="hsw tt" />טיקטוק</span>
        <span><span className="hsw ev" />אירועים ומועדים</span>
      </div>

      <section className="sec">
        <div className="label dotted">סטוריז קבועים</div>
        <div className="note">
          {p.recurring.map((s) => (
            <div key={s.id} className="srow">
              <span>{s.title}</span>
              <div className="days">
                {WD_SHORT.map((w, ix) => (
                  <button key={ix} aria-pressed={s.weekdays.includes(ix)} aria-label={WEEKDAYS[ix]} disabled={!p.canEdit}
                    onClick={() => start(() => setRecurringDays(p.clientId, s.id,
                      s.weekdays.includes(ix) ? s.weekdays.filter((x) => x !== ix) : [...s.weekdays, ix].sort()))}>
                    {w}
                  </button>
                ))}
                {p.canEdit && <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteRecurring(p.clientId, s.id))}>×</button>}
              </div>
            </div>
          ))}
          {!p.recurring.length && <p className="empty">עוד אין סטוריז קבועים</p>}
          {p.canEdit && <AddLine placeholder="סטורי קבוע חדש, למשל: שעות פתיחה" onAdd={(t) => addRecurring(p.clientId, t)} />}
        </div>
        {p.canEdit && <span className="txt">סטורי חד-פעמי (אירוע, מבצע) מוסיפים בלחיצה על היום בלוח.</span>}
      </section>

      {day && !editor && (
        <Sheet onClose={() => setDay(null)} label="תוכן היום">
          <h2>יום {WEEKDAYS[parseISODate(day).getUTCDay()]}, {Number(day.slice(8))} ב{MONTHS[first.getUTCMonth()]}</h2>
          {(p.special.some((e) => e.date === day) || p.custom.some((e) => e.date === day) || p.canEdit) && (
            <div className="field">
              <span className="label">אירועים וימים מיוחדים</span>
              <div className="chiprow">
                {p.special.filter((e) => e.date === day).map((e) => <span key={e.title} className={`hchip ${e.kind}`}>{e.title}</span>)}
                {p.custom.filter((e) => e.date === day).map((e) => (
                  <span key={e.id} className="hchip custom">★ {e.title}
                    {p.canEdit && <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteClientEvent(p.clientId, e.id))}>×</button>}
                  </span>
                ))}
              </div>
              {p.canEdit && <AddLine placeholder="הוספת אירוע מיוחד (השקה, ערב טעימות, מבצע…)" onAdd={(t) => addClientEvent(p.clientId, day, t)} />}
            </div>
          )}
          <div className="stack">
            {p.items.filter((i) => i.date === day).map((i) => (
              <button key={i.id} className="item" onClick={() => p.canEdit && setEditor({ item: i, date: day })} disabled={!p.canEdit}>
                <span className="thumb" style={i.thumb_path && p.thumbs[i.thumb_path] ? { backgroundImage: `url(${p.thumbs[i.thumb_path]})` } : undefined}>{i.thumb_path && p.thumbs[i.thumb_path] ? "" : TYPE_LABEL[i.type]}</span>
                <span className="tx col">
                  <span className="t">{i.title}</span>
                  <span className="txt"><span className="sdot" style={{ ["--c" as string]: `var(--s-${i.status})` }} /> {STATUS_LABEL[i.status]}</span>
                </span>
                {p.canEdit && <span className="arrow"><Chevron dir="forward" /></span>}
              </button>
            ))}
          </div>
          <div className="field">
            <span className="label">סטוריז</span>
            <div className="chiprow">
              {storiesOn(day).map((s) => {
                const isDone = p.checks.includes(`${s.ref}|${day}`);
                return (
                  <span key={s.ref} className="schipwrap">
                    <button className="schip" aria-pressed={isDone} disabled={!p.canEdit}
                      onClick={() => start(() => setStoryDoneOn(p.clientId, s.ref, day, !isDone))}>
                      <i>✓</i>{s.title}
                    </button>
                    {s.oneOffId && p.canEdit && <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteOneOff(p.clientId, s.oneOffId!))}>×</button>}
                  </span>
                );
              })}
              {!storiesOn(day).length && <span className="txt">אין סטוריז ביום הזה</span>}
            </div>
            {p.canEdit && <AddLine placeholder="+ הוספת סטורי ליום הזה" onAdd={(t) => addOneOff(p.clientId, day, t)} />}
          </div>
          {p.canEdit && (
            <div className="acts2">
              <span />
              <button className="pbtn" onClick={() => setEditor({ date: day })}>תוכן חדש</button>
            </div>
          )}
        </Sheet>
      )}

      {editor && <ItemEditor clientId={p.clientId} studioId={p.studioId} thumbs={p.thumbs} target={editor} onClose={() => { setEditor(null); }} />}
    </>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <form className="addrow" action={(fd) => { const t = String(fd.get("t") ?? ""); start(() => onAdd(t)); }}>
      <input name="t" placeholder={placeholder} aria-label={placeholder} disabled={pending} autoComplete="off" />
    </form>
  );
}
