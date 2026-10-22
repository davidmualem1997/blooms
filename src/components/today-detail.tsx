"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setItemLive, setStoryDone } from "@/app/(app)/actions";
import { formatIL } from "@/lib/dates";
import { copyText, saveMedia } from "@/lib/share-media";
import type { TodoRow } from "@/lib/today";
import { STATUS_LABEL, type ContentItem, type ContentType } from "@/lib/types";
import { ContentIcon } from "./content-icon";
import { ItemEditor } from "./item-editor";

type Media = { path: string; thumb: string | null; kind: string };
type Meeting = { id: string; starts_at: string; kind: string; location: string };
type Event = { id: string; title: string };
const KIND = { meet: "פגישה", call: "שיחת טלפון", zoom: "זום" } as Record<string, string>;
const GROUPS: { k: ContentType; l: string }[] = [{ k: "post", l: "פוסטים" }, { k: "reel", l: "רילסים" }, { k: "tiktok", l: "טיקטוק" }];

// תמונות וסרטונים במלואם, בגלילה הצידה כשיש כמה
function MediaStrip({ media, urls, tall }: { media: Media[]; urls: Record<string, string>; tall: boolean }) {
  if (!media.length) return <div className={`td-full empty-media${tall ? " tall" : ""}`}><span className="txt">עוד אין קובץ</span></div>;
  return (
    <div className="td-strip">
      {media.map((m) => {
        const src = urls[m.path];
        const poster = m.thumb ? urls[m.thumb] : undefined;
        return (
          <div key={m.path} className={`td-full${tall ? " tall" : ""}`}>
            {m.kind === "video"
              ? (src ? <video src={src} poster={poster} controls playsInline preload="metadata" /> : <span className="txt">סרטון</span>)
              // eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני
              : (src || poster ? <img src={src ?? poster} alt="" loading="lazy" /> : <span className="txt">תמונה</span>)}
          </div>
        );
      })}
    </div>
  );
}

// "היום": רק מה שעולה היום – לפי סוג, עם התוכן המלא ופעולות
export function TodayDetail({ clientId, studioId, rows, urls, storyMedia, meetings, events }: {
  clientId: string; studioId: string; rows: TodoRow[]; urls: Record<string, string>;
  storyMedia: Record<string, Media[]>; meetings: Meeting[]; events: Event[];
}) {
  const [, start] = useTransition();
  const [state, apply] = useOptimistic(rows, (s, a: { key: string; done: boolean }) =>
    s.map((r) => ((r.kind === "item" ? r.item.id : r.ref) === a.key ? { ...r, done: a.done } : r)));
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [toast, setToast] = useState("");
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2200); };
  const items = state.filter((r): r is Extract<TodoRow, { kind: "item" }> => r.kind === "item");
  const stories = state.filter((r): r is Extract<TodoRow, { kind: "story" }> => r.kind === "story");
  const oneOffs = stories.filter((s) => storyMedia[s.ref]?.length);
  const checklist = stories.filter((s) => !storyMedia[s.ref]?.length);

  async function saveAll(media: Media[]) { for (const m of media) await saveMedia(m.path); }

  return (
    <section className="sec today-detail">
      {(meetings.length > 0 || events.length > 0) && (
        <div className="td-agenda">
          {meetings.map((m) => <div key={m.id} className="td-pill"><ContentIcon kind="meeting" size={15} /><b className="num">{formatIL(m.starts_at).time}</b> {KIND[m.kind] ?? "פגישה"}{m.location ? ` · ${m.location}` : ""}</div>)}
          {events.map((e) => <div key={e.id} className="td-pill"><ContentIcon kind="event" size={15} /> {e.title}</div>)}
        </div>
      )}

      <div className="sechead"><div className="label dotted">עולה היום</div><span className="txt num">{state.filter((r) => r.done).length}/{state.length} עלו</span></div>
      {!state.length && <p className="empty">אין העלאות היום</p>}

      {GROUPS.map((g) => {
        const list = items.filter((r) => r.item.type === g.k);
        if (!list.length) return null;
        return (
          <div key={g.k} className="td-group">
            <h3 className="td-gh"><ContentIcon kind={g.k} size={17} /> {g.l} <span className="txt num">{list.length}</span></h3>
            {list.map(({ item, done }) => (
              <article key={item.id} className={`td-post${done ? " done" : ""}`}>
                <MediaStrip media={item.media} urls={urls} tall={item.type !== "post"} />
                <div className="td-post-body">
                  <div className="td-type">
                    {item.time && <b className="num">{item.time.slice(0, 5)}</b>}
                    <span className={`td-status s-${done ? "live" : item.status}`}>{done ? "עלה ✓" : STATUS_LABEL[item.status]}</span>
                  </div>
                  <b className="td-title">{item.title}</b>
                  {item.caption && <p className="td-caption full">{item.caption}</p>}
                  <div className="td-actions">
                    <button className={`td-btn primary${done ? " on" : ""}`} onClick={() => start(async () => { apply({ key: item.id, done: !done }); await setItemLive(item.id, !done); })}>{done ? "עלה ✓" : "סימון שעלה"}</button>
                    {item.caption && <button className="td-btn" onClick={async () => flash((await copyText(item.caption)) ? "הטקסט הועתק ✓" : "לא הצלחנו להעתיק")}>העתקת טקסט</button>}
                    {item.media.length > 0 && <button className="td-btn" onClick={() => saveAll(item.media)}>הורדה{item.media.length > 1 ? ` (${item.media.length})` : ""}</button>}
                    <button className="td-btn" onClick={() => setEditing(item)}>עריכה</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        );
      })}

      {stories.length > 0 && (
        <div className="td-group">
          <h3 className="td-gh"><ContentIcon kind="story" size={17} /> סטוריז <span className="txt num">{stories.length}</span></h3>
          {oneOffs.map((s) => (
            <article key={s.ref} className={`td-post td-story${s.done ? " done" : ""}`}>
              <MediaStrip media={storyMedia[s.ref]} urls={urls} tall />
              <div className="td-post-body">
                <b className="td-title">{s.title}</b>
                <div className="td-actions">
                  <button className={`td-btn primary${s.done ? " on" : ""}`} onClick={() => start(async () => { apply({ key: s.ref, done: !s.done }); await setStoryDone(clientId, s.ref, !s.done); })}>{s.done ? "עלה ✓" : "סימון שעלה"}</button>
                  <button className="td-btn" onClick={() => saveAll(storyMedia[s.ref])}>הורדה</button>
                </div>
              </div>
            </article>
          ))}
          {checklist.length > 0 && (
            <div className="note reminders">
              {checklist.map((s) => (
                <div key={s.ref} className={`rem${s.done ? " done" : ""}`}>
                  <button className="rem-dot" aria-pressed={s.done} aria-label={s.done ? "עלה" : "סימון שעלה"}
                    onClick={() => start(async () => { apply({ key: s.ref, done: !s.done }); await setStoryDone(clientId, s.ref, !s.done); })} />
                  <span className="rem-text">{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {editing && <ItemEditor clientId={clientId} studioId={studioId} thumbs={urls} target={{ item: editing, date: editing.date }} onClose={() => setEditing(null)} />}
    </section>
  );
}
