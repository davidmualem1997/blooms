"use client";

import { Chevron } from "./chevron";

import { useOptimistic, useState, useTransition } from "react";
import { ItemQuickView } from "./item-quick-view";
import Link from "next/link";
import { setItemLive, setStoryDone } from "@/app/(app)/actions";
import { TYPE_LABEL } from "@/lib/types";
import type { TodoRow } from "@/lib/today";

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const rowKey = (r: TodoRow) => (r.kind === "item" ? r.item.id : r.ref);

// רשימת "להעלות היום" של לקוח אחד; הסימון מתעדכן מיד ונשמר ברקע
export function TodoList({ clientId, clientName, color, rows, linkToPortal, thumbs = {} }: {
  clientId: string; clientName: string; color: string; rows: TodoRow[]; linkToPortal: boolean; thumbs?: Record<string, string>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, toggle] = useOptimistic(rows, (state, key: string) =>
    state.map((r) => (rowKey(r) === key ? { ...r, done: !r.done } : r)),
  );
  const doneCount = optimistic.filter((r) => r.done).length;

  function onToggle(r: TodoRow) {
    startTransition(async () => {
      toggle(rowKey(r));
      if (r.kind === "item") await setItemLive(r.item.id, !r.done);
      else await setStoryDone(clientId, r.ref, !r.done);
    });
  }

  return (
    <div className="tgroup">
      <div className="thead">
        <span className="dotc" style={{ background: color }} />
        {linkToPortal ? <Link href={`/c/${clientId}`} className="gocl">{clientName} <Chevron dir="forward" size={14} /></Link> : clientName}
        <span className="txt num">{doneCount}/{optimistic.length}</span>
      </div>
      {optimistic.map((r) => (
        <div key={rowKey(r)} className={`todo${r.done ? " done" : ""}`}>
          <button className="tick" aria-pressed={r.done} aria-label="סימון שעלה" onClick={() => onToggle(r)}>
            <Check />
          </button>
          <span className="tx" role={r.kind === "item" ? "button" : undefined} tabIndex={r.kind === "item" ? 0 : undefined}
            onClick={() => r.kind === "item" && setOpen(r.item.id)} onKeyDown={(e) => r.kind === "item" && e.key === "Enter" && setOpen(r.item.id)}>
            <span className="t">{r.kind === "item" ? r.item.title : r.title}</span>
            <span className={`tag${r.kind === "item" && r.item.type === "tiktok" ? " tt" : ""}`}>
              {r.kind === "item" ? TYPE_LABEL[r.item.type] : "סטורי"}
            </span>
          </span>
          {r.kind === "item" ? <span className="arrow"><Chevron dir="forward" size={14} /></span> : <span />}
        </div>
      ))}
      {(() => {
        const r = optimistic.find((x) => x.kind === "item" && x.item.id === open);
        return r && r.kind === "item" ? (
          <ItemQuickView item={r.item} thumbs={thumbs} done={r.done} onToggle={() => onToggle(r)} onClose={() => setOpen(null)} />
        ) : null;
      })()}
    </div>
  );
}
