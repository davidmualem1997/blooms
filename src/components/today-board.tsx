"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setItemLive, setStoryDone } from "@/app/(app)/actions";
import { TYPE_LABEL } from "@/lib/types";
import type { TodoRow } from "@/lib/today";
import { Avatar } from "./avatar";
import { ItemQuickView } from "./item-quick-view";

export type BoardRow = { clientId: string; clientName: string; owner: { name: string; avatar: string | null }; row: TodoRow };

const keyOf = (r: BoardRow) => (r.row.kind === "item" ? r.row.item.id : `${r.clientId}|${r.row.ref}`);
// מוכן = אושר ויש קבצים; חסר משהו = אין קבצים או שעוד לא אושר
function statusOf(r: TodoRow): { k: "live" | "ready" | "missing"; l: string } {
  if (r.done) return { k: "live", l: "עלה ✓" };
  if (r.kind === "story") return { k: "ready", l: "מוכן" };
  if (!r.item.media.length) return { k: "missing", l: "חסר קובץ" };
  if (r.item.status !== "ok") return { k: "missing", l: "לא אושר" };
  return { k: "ready", l: "מוכן" };
}

// "עולה היום" לדאשבורד מנהלת הסטודיו: אצלי | אצל הצוות
export function TodayBoard({ mine, team, thumbs }: { mine: BoardRow[]; team: BoardRow[]; thumbs: Record<string, string> }) {
  const [tab, setTab] = useState<"mine" | "team">(mine.length || !team.length ? "mine" : "team");
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();
  const all = [...mine, ...team];
  const [rows, flip] = useOptimistic(all, (s, k: string) => s.map((r) => (keyOf(r) === k ? { ...r, row: { ...r.row, done: !r.row.done } } : r)));
  const shown = rows.filter((r) => (tab === "mine" ? mine : team).some((x) => keyOf(x) === keyOf(r)));
  const count = (list: BoardRow[]) => `${rows.filter((r) => list.some((x) => keyOf(x) === keyOf(r)) && r.row.done).length}/${list.length}`;

  function toggle(r: BoardRow) {
    start(async () => {
      flip(keyOf(r));
      if (r.row.kind === "item") await setItemLive(r.row.item.id, !r.row.done);
      else await setStoryDone(r.clientId, r.row.ref, !r.row.done);
    });
  }
  const opened = rows.find((r) => keyOf(r) === open);

  return (
    <section className="sec">
      <div className="sechead">
        <div className="label dotted">עולה היום</div>
        <div className="seg small">
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>אצלי <span className="num">{count(mine)}</span></button>
          <button type="button" aria-pressed={tab === "team"} onClick={() => setTab("team")}>אצל הצוות <span className="num">{count(team)}</span></button>
        </div>
      </div>
      <div className="note">
        {shown.map((r) => {
          const st = statusOf(r.row);
          const type = r.row.kind === "item" ? TYPE_LABEL[r.row.item.type] : "סטורי";
          const title = r.row.kind === "item" ? r.row.item.title : r.row.title;
          return (
            <div key={keyOf(r)} className={`todo board${r.row.done ? " done" : ""}`}>
              <button className="tick" aria-pressed={r.row.done} aria-label="סימון שעלה" onClick={() => toggle(r)}>✓</button>
              <button className="tx col" onClick={() => r.row.kind === "item" && setOpen(keyOf(r))}>
                <span className="t">{title}</span>
                <span className="txt">{r.clientName} · {type}</span>
              </button>
              <span className="board-end">
                <span className={`bstatus ${st.k}`}>{st.l}</span>
                <span title={r.owner.name}><Avatar src={r.owner.avatar} name={r.owner.name} size={24} /></span>
              </span>
            </div>
          );
        })}
        {!shown.length && <p className="txt">{tab === "mine" ? "אין לך העלאות היום" : "אין העלאות אצל הצוות היום"}</p>}
      </div>
      {opened && opened.row.kind === "item" && (
        <ItemQuickView item={opened.row.item} thumbs={thumbs} done={opened.row.done} onToggle={() => toggle(opened)} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
