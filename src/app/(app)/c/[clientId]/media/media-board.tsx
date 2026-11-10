"use client";

import { useEffect, useMemo, useState } from "react";
import { ContentIcon } from "@/components/content-icon";
import { ClientItemSheet } from "@/components/client-item-sheet";
import { ItemEditor, type EditorTarget } from "@/components/item-editor";
import { Sheet } from "@/components/sheet";
import { MediaStrip } from "@/components/today-detail";
import { MONTHS, parseISODate, shortDate } from "@/lib/dates";
import { type ContentItem, type OneOffStory } from "@/lib/types";
import { StorySheet } from "../stories/stories-board";

type Kind = "post" | "reel" | "tiktok" | "story";
const KINDS: { k: Kind; l: string }[] = [
  { k: "post", l: "פוסטים" }, { k: "reel", l: "ריילס" }, { k: "tiktok", l: "טיקטוק" }, { k: "story", l: "סטוריז" },
];
const KIND_LABEL: Record<Kind, string> = { post: "פוסט", reel: "ריל", tiktok: "טיקטוק", story: "סטורי" };
type Entry = { key: string; kind: Kind; date: string; title: string; src?: string; video?: string; item?: ContentItem; story?: OneOffStory };
const STORE = "blooms.media.kinds";

export function MediaBoard({ clientId, studioId, items, stories, urls, canEdit }: {
  clientId: string; studioId: string; items: ContentItem[]; stories: OneOffStory[]; urls: Record<string, string>; canEdit: boolean;
}) {
  const [show, setShow] = useState<Set<Kind>>(new Set(KINDS.map((x) => x.k)));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as Kind[] | null;
      if (saved?.length) setShow(new Set(saved)); // eslint-disable-line react-hooks/set-state-in-effect -- העדפה שמורה במכשיר
    } catch { /* אין גישה לאחסון */ }
  }, []);
  const save = (next: Set<Kind>) => {
    setShow(next);
    try { localStorage.setItem(STORE, JSON.stringify([...next])); } catch { /* אין גישה לאחסון */ }
  };
  const all = show.size === KINDS.length;
  // לחיצה על סוג כשהכול מוצג = רק הסוג הזה; אחר כך מוסיפים/מורידים
  const toggle = (k: Kind) => {
    if (all) return save(new Set([k]));
    const next = new Set(show);
    if (next.has(k)) next.delete(k); else next.add(k);
    save(next.size ? next : new Set(KINDS.map((x) => x.k)));
  };

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [story, setStory] = useState<OneOffStory | null>(null);
  const [editStory, setEditStory] = useState<OneOffStory | null>(null);

  const entries = useMemo(() => {
    const out: Entry[] = [
      ...items.map((i): Entry => {
        const video = !i.thumb_path ? i.media.find((m) => m.kind === "video")?.path : undefined;
        return { key: `i${i.id}`, kind: i.type, date: i.date, title: i.title, src: i.thumb_path ? urls[i.thumb_path] : undefined, video: video ? urls[video] : undefined, item: i };
      }),
      ...stories.map((s): Entry => {
        const m = s.media?.[0];
        return { key: `s${s.id}`, kind: "story", date: s.date, title: s.title, src: m?.thumb ? urls[m.thumb] : m?.kind === "image" ? urls[m.path] : undefined, video: !m?.thumb && m?.kind === "video" ? urls[m.path] : undefined, story: s };
      }),
    ].filter((e) => show.has(e.kind));
    out.sort((a, b) => b.date.localeCompare(a.date));
    // מקובצים לפי חודש
    const months: { key: string; label: string; list: Entry[] }[] = [];
    for (const e of out) {
      const key = e.date.slice(0, 7);
      if (months.at(-1)?.key !== key) {
        const d = parseISODate(e.date);
        months.push({ key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, list: [] });
      }
      months.at(-1)!.list.push(e);
    }
    return months;
  }, [items, stories, urls, show]);
  const count = entries.reduce((n, m) => n + m.list.length, 0);

  return (
    <>
      <div className="layers media-kinds" role="group" aria-label="מה להציג">
        <button type="button" className="layer all" aria-pressed={all} onClick={() => save(new Set(KINDS.map((x) => x.k)))}>הכול</button>
        {KINDS.map((x) => (
          <button key={x.k} type="button" className="layer" aria-pressed={!all && show.has(x.k)} onClick={() => toggle(x.k)}>
            <ContentIcon kind={x.k} />{x.l}
          </button>
        ))}
      </div>
      <p className="txt num">{count} פריטים</p>

      {entries.map((m) => (
        <section key={m.key} className="media-month">
          <div className="label dotted">{m.label}</div>
          <div className="feed media-grid">
            {m.list.map((e) => (
              <button key={e.key} className="tile" aria-label={`${KIND_LABEL[e.kind]}: ${e.title}`}
                style={e.src ? { backgroundImage: `url(${e.src})` } : undefined}
                onClick={() => (e.item ? setEditor({ item: e.item, date: e.date }) : setStory(e.story!))}>
                {!e.src && e.video && <video className="tile-video" src={`${e.video}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" />}
                {!e.src && !e.video && <span className="ph">{e.title}</span>}
                <span className="kd"><ContentIcon kind={e.kind} size={15} /></span>
                <span className="dt num">{shortDate(e.date)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!count && <p className="empty">{all ? "עוד אין תוכן" : "אין תוכן מהסוג הזה"}</p>}

      {editor?.item && !canEdit && <ClientItemSheet clientId={clientId} item={editor.item} urls={urls} onClose={() => setEditor(null)} />}
      {editor && canEdit && <ItemEditor clientId={clientId} studioId={studioId} thumbs={urls} target={editor} onClose={() => setEditor(null)} />}
      {story && (
        <Sheet onClose={() => setStory(null)} label={story.title}>
          <MediaStrip media={story.media ?? []} urls={urls} tall />
          <h2>{story.title}</h2>
          <div className="txt">סטורי · {shortDate(story.date)}</div>
          {canEdit && (
            <div className="acts2"><span />
              <button className="tbtn" onClick={() => { setEditStory(story); setStory(null); }}>עריכה</button>
            </div>
          )}
        </Sheet>
      )}
      {editStory && (
        <StorySheet clientId={clientId} studioId={studioId} date={editStory.date} onClose={() => setEditStory(null)}
          story={{ ref: `o:${editStory.id}`, id: editStory.id, title: editStory.title, recurring: false, media: editStory.media ?? [], done: false }} />
      )}
    </>
  );
}
