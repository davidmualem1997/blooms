"use client";

import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, useTransition } from "react";
import { reorderDates } from "@/app/(app)/c/[clientId]/gantt/actions";
import { parseISODate, toISODate } from "@/lib/dates";
import type { ContentItem } from "@/lib/types";
import { ClientItemSheet } from "./client-item-sheet";
import { ItemEditor, type EditorTarget } from "./item-editor";

const Play = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const Multi = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>;

// תכנון הפיד: קודם מסדרים כאן, והלוח מתעדכן. גרירה משנה את הסדר ואת התאריכים
// tiktok: אותו תכנון בדיוק, עם ריבועים אנכיים כמו בפרופיל של טיקטוק
export function FeedPlanner({ clientId, studioId, items, thumbs, today, canEdit, tiktok = false }: {
  clientId: string; studioId: string; items: ContentItem[]; thumbs: Record<string, string>; today: string; canEdit: boolean; tiktok?: boolean;
}) {
  const [order, setOrder] = useState(items);
  const [blanks, setBlanks] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [, start] = useTransition();
  useEffect(() => setOrder(items), [items]); // eslint-disable-line react-hooks/set-state-in-effect -- סנכרון אחרי שמירה בשרת
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((i) => i.id === e.active.id);
    const to = order.findIndex((i) => i.id === e.over!.id);
    const next = arrayMove(order, from, to);
    // התאריכים נשארים אותם תאריכים (מהחדש לישן) – רק מתחלקים מחדש לפי הסדר
    const dates = order.map((i) => i.date).sort().reverse();
    const withDates = next.map((i, ix) => ({ ...i, date: dates[ix] }));
    setOrder(withDates);
    const changed = withDates.filter((i) => items.find((x) => x.id === i.id)?.date !== i.date).map((i) => ({ id: i.id, date: i.date }));
    if (changed.length) start(() => reorderDates(clientId, changed));
  }

  // ריבוע ריק מקבל את התאריך הפנוי הבא: 3 ימים אחרי הפוסט האחרון
  function nextDate(offset: number) {
    const last = order.map((i) => i.date).sort().at(-1);
    const d = parseISODate(last && last > today ? last : today);
    d.setUTCDate(d.getUTCDate() + 3 * (offset + 1));
    return toISODate(d);
  }

  return (
    <>
      <DndContext id={tiktok ? "feed-tt" : "feed-ig"} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((i) => i.id)} strategy={rectSortingStrategy} disabled={!canEdit}>
          <div className={`feed${tiktok ? " tt" : ""}`}>
            {Array.from({ length: blanks }, (_, k) => (
              <button key={`b${k}`} className="tile blank" onClick={() => canEdit && setEditor({ date: nextDate(blanks - 1 - k), type: tiktok ? "tiktok" : undefined })} aria-label="ריבוע ריק – העלאת תוכן">
                <span className="ph">+</span>
              </button>
            ))}
            {order.map((i) => {
              const video = !i.thumb_path ? i.media.find((m) => m.kind === "video")?.path : undefined;
              return <Tile key={i.id} item={i} src={i.thumb_path ? thumbs[i.thumb_path] : undefined} video={video ? thumbs[video] : undefined} onOpen={() => setEditor({ item: i, date: i.date })} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
      {canEdit && (
        <div className="acts2 feed-acts">
          <span className="txt">{order.length > 1 ? "גוררים ריבוע כדי לשנות את הסדר. התאריכים מתעדכנים בגאנט." : ""}</span>
          <button className="edit" onClick={() => setBlanks((b) => b + 3)}>+ שורה ריקה</button>
        </div>
      )}
      {editor?.item && !canEdit && <ClientItemSheet clientId={clientId} item={editor.item} urls={thumbs} onClose={() => setEditor(null)} />}
      {editor && canEdit && (
        <ItemEditor clientId={clientId} studioId={studioId} thumbs={thumbs} target={editor}
          onClose={() => { if (!editor.item) setBlanks((b) => Math.max(0, b - 1)); setEditor(null); }} />
      )}
    </>
  );
}

function Tile({ item, src, video, onOpen }: { item: ContentItem; src?: string; video?: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={`tile${isDragging ? " dragging" : ""}`} aria-label={item.title}
      style={{ transform: CSS.Transform.toString(transform), transition, ...(src ? { backgroundImage: `url(${src})` } : {}) }}>
      {!src && video && <video className="tile-video" src={`${video}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" />}
      {!src && !video && <span className="ph">{item.title}</span>}
      {item.type === "reel" || item.type === "tiktok" ? <span className="kd"><Play /></span> : item.media.length > 1 ? <span className="kd"><Multi /></span> : null}
    </button>
  );
}
