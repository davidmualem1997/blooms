"use client";

import { Chevron } from "@/components/chevron";

import { useState, useTransition } from "react";
import { ItemEditor, type EditorTarget } from "@/components/item-editor";
import { MonthList, type FocusItem } from "@/components/month-list";
import { Sheet } from "@/components/sheet";
import { ContentIcon } from "@/components/content-icon";
import { MONTHS, WEEKDAYS, parseISODate } from "@/lib/dates";
import { STATUS_LABEL, TYPE_LABEL, type ClientEvent, type ContentItem, type OneOffStory, type RecurringStory } from "@/lib/types";
import type { CalEvent } from "@/lib/holidays";
import { addClientEvent, addOneOff, addRecurring, deleteClientEvent, deleteOneOff, deleteRecurring, setRecurringDays, setStoryDoneOn } from "./actions";

type Props = {
  clientId: string; studioId: string; thumbs: Record<string, string>; month: string; today: string; canEdit: boolean;
  items: ContentItem[]; recurring: RecurringStory[]; oneOff: OneOffStory[]; checks: string[]; focus: FocusItem[];
  special: CalEvent[]; custom: ClientEvent[];
  openItem?: string; // מהתראה: פותח את הפריט ישר
  title: string; // שם החודש
  nav: React.ReactNode; // חצים למעבר בין חודשים
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
      {/* לוח החודש: משטח לבן רציף אחד, בלי רווחים בין הימים – רק קו דק בין השבועות */}
      <div className="calcard">
        <div className="calhead">
          <h2>{p.title}</h2>
          <div className="calnavs">{p.nav}</div>
        </div>
        <div className="calgrid">
          {WEEKDAYS.map((w) => <div key={w} className="calwd">{w}</div>)}
          {Array.from({ length: first.getUTCDay() }, (_, i) => <div key={`b${i}`} className="calday blank" />)}
          {dates.map((d) => {
            const its = p.items.filter((i) => i.date === d);
            const ss = storiesOn(d);
            const wd = parseISODate(d).getUTCDay();
            const special = p.special.some((e) => e.date === d); // חג / יום זיכרון – כל היום מסומן באפור
            return (
              <button key={d} className={`calday${d === p.today ? " today" : ""}${d < p.today ? " past" : ""}${wd === 6 ? " sat" : ""}${special ? " hol" : ""}`} onClick={() => setDay(d)}
                aria-label={`${Number(d.slice(8))} ב${MONTHS[first.getUTCMonth()]}`}>
                <span className="cnum num">{Number(d.slice(8))}</span>
                {p.special.filter((e) => e.date === d).map((e) => (
                  <span key={e.title} className="ctg gray"><ContentIcon kind={e.kind === "memorial" ? "memorial" : "holiday"} size={10} /><span>{e.title}</span></span>
                ))}
                {p.custom.filter((e) => e.date === d).map((e) => (
                  <span key={e.id} className="ctg gray"><ContentIcon kind="event" size={10} /><span>{e.title}</span></span>
                ))}
                {its.map((i) => (
                  <span key={i.id} className={`ctg ${i.type === "tiktok" ? "pink" : "yellow"}${i.status === "live" ? " done" : ""}`} title={`${TYPE_LABEL[i.type]} · ${i.title} · ${STATUS_LABEL[i.status]}`}>
                    <ContentIcon kind={i.type} size={10} /><span>{i.title}</span>
                  </span>
                ))}
                {ss.length > 0 && <span className="ctg st"><ContentIcon kind="story" size={10} /><span>{ss.length === 1 ? ss[0].title : `${ss.length} סטוריז`}</span></span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend">
        <span><span className="hsw ig" /><ContentIcon kind="post" size={12} /> אינסטגרם</span>
        <span><span className="hsw tt" /><ContentIcon kind="tiktok" size={12} /> טיקטוק</span>
        <span><ContentIcon kind="story" size={12} /> סטוריז</span>
        <span><span className="hsw ev" /><ContentIcon kind="event" size={12} /> אירועים ומועדים</span>
      </div>

      <MonthList clientId={p.clientId} month={p.month} kind="content" items={p.focus} canEdit={p.canEdit}
        title="דגשים לחודש" placeholder="דגש חדש לחודש" />

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
