"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setItemLive, setStoryDone } from "@/app/(app)/actions";
import { formatIL } from "@/lib/dates";
import { copyText, saveMedia } from "@/lib/share-media";
import type { TodoRow } from "@/lib/today";
import { STATUS_LABEL, TYPE_LABEL, type ContentItem } from "@/lib/types";
import { ContentIcon } from "./content-icon";
import { ItemEditor } from "./item-editor";

type Meeting = { id: string; starts_at: string; kind: string; location: string };
type Event = { id: string; title: string; description?: string | null };
const KIND = { meet: "פגישה", call: "שיחת טלפון", zoom: "זום" } as Record<string, string>;

// "היום" בדף הבית של הלקוח: כל מה שעולה היום – עם התוכן עצמו ופעולות ישר מכאן
export function TodayDetail({ clientId, studioId, rows, thumbs, meetings, events }: {
  clientId: string; studioId: string; rows: TodoRow[]; thumbs: Record<string, string>; meetings: Meeting[]; events: Event[];
}) {
  const [, start] = useTransition();
  const [state, apply] = useOptimistic(rows, (s, a: { key: string; done: boolean }) =>
    s.map((r) => ((r.kind === "item" ? r.item.id : r.ref) === a.key ? { ...r, done: a.done } : r)));
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [toast, setToast] = useState("");
  const items = state.filter((r): r is Extract<TodoRow, { kind: "item" }> => r.kind === "item");
  const stories = state.filter((r): r is Extract<TodoRow, { kind: "story" }> => r.kind === "story");
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2200); };

  return (
    <section className="sec today-detail">
      {(meetings.length > 0 || events.length > 0) && (
        <div className="td-agenda">
          {meetings.map((m) => (
            <div key={m.id} className="td-pill"><ContentIcon kind="meeting" size={15} /><b className="num">{formatIL(m.starts_at).time}</b> {KIND[m.kind] ?? "פגישה"}{m.location ? ` · ${m.location}` : ""}</div>
          ))}
          {events.map((e) => <div key={e.id} className="td-pill"><ContentIcon kind="event" size={15} /> {e.title}</div>)}
        </div>
      )}

      <div className="sechead"><div className="label dotted">עולה היום</div><span className="txt num">{state.filter((r) => r.done).length}/{state.length}</span></div>
      {!items.length && !stories.length && <p className="empty">אין העלאות היום</p>}

      {items.map(({ item, done }) => {
        const thumb = item.thumb_path ? thumbs[item.thumb_path] : undefined;
        const video = !thumb ? item.media.find((m) => m.kind === "video")?.path : undefined;
        const first = item.media[0]?.path;
        return (
          <article key={item.id} className={`td-card${done ? " done" : ""}`}>
            <button className="td-media" onClick={() => setEditing(item)} aria-label={`פתיחת ${item.title}`}
              style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
              {!thumb && video && thumbs[video] && <video src={`${thumbs[video]}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" />}
              {!thumb && !video && <span className="mph">{TYPE_LABEL[item.type]}</span>}
              {done && <span className="td-live" aria-label="עלה">✓</span>}
            </button>
            <div className="td-body">
              <div className="td-type"><ContentIcon kind={item.type} size={14} /> {TYPE_LABEL[item.type]}{item.time ? <span className="num"> · {item.time.slice(0, 5)}</span> : null}
                <span className={`td-status s-${done ? "live" : item.status}`}>{done ? "עלה" : STATUS_LABEL[item.status]}</span></div>
              <b className="td-title">{item.title}</b>
              {item.caption && <p className="td-caption">{item.caption}</p>}
              <div className="td-actions">
                <button className={`td-btn primary${done ? " on" : ""}`} onClick={() => start(async () => { apply({ key: item.id, done: !done }); await setItemLive(item.id, !done); })}>
                  {done ? "עלה ✓" : "סימון שעלה"}
                </button>
                {item.caption && <button className="td-btn" onClick={async () => flash((await copyText(item.caption)) ? "הטקסט הועתק ✓" : "לא הצלחנו להעתיק")}>העתקת טקסט</button>}
                {first && <button className="td-btn" onClick={() => saveMedia(first)}>שמירה</button>}
                <button className="td-btn" onClick={() => setEditing(item)}>עריכה</button>
              </div>
            </div>
          </article>
        );
      })}

      {stories.length > 0 && (
        <div className="note reminders">
          {stories.map((s) => (
            <div key={s.ref} className={`rem${s.done ? " done" : ""}`}>
              <button className="rem-dot" aria-pressed={s.done} aria-label={s.done ? "עלה" : "סימון שעלה"}
                onClick={() => start(async () => { apply({ key: s.ref, done: !s.done }); await setStoryDone(clientId, s.ref, !s.done); })} />
              <span className="rem-text">{s.title}</span>
              <span className="txt"><ContentIcon kind="story" size={13} /> סטורי</span>
            </div>
          ))}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {editing && <ItemEditor clientId={clientId} studioId={studioId} thumbs={thumbs} target={{ item: editing, date: editing.date }} onClose={() => setEditing(null)} />}
    </section>
  );
}
