"use client";

import { useState } from "react";
import { mediaStreamUrl } from "@/app/(app)/c/[clientId]/gantt/actions";
import { shortDate } from "@/lib/dates";
import { STATUS_LABEL, TYPE_LABEL, type ContentItem } from "@/lib/types";
import { ItemEditor } from "./item-editor";
import { Sheet } from "./sheet";

type Common = { clientId: string; studioId: string; canEdit: boolean; thumbs: Record<string, string>; today: string };

function useOpen(p: Common) {
  const [open, setOpen] = useState<ContentItem | null>(null);
  const node = open ? (p.canEdit
    ? <ItemEditor clientId={p.clientId} studioId={p.studioId} thumbs={p.thumbs} target={{ item: open, date: open.date }} onClose={() => setOpen(null)} />
    : <Preview item={open} thumbs={p.thumbs} onClose={() => setOpen(null)} />) : null;
  return [setOpen, node] as const;
}

const Play = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;

// פיד טיקטוק: כרטיסים אנכיים, המתוכננים קודם ואחריהם מה שעלה
export function TikTokFeed(p: Common & { items: ContentItem[]; handle: string }) {
  const [open, node] = useOpen(p);
  const up = p.items.filter((i) => i.date >= p.today);
  const past = p.items.filter((i) => i.date < p.today).reverse();
  const card = (i: ContentItem) => <TikTokCard key={i.id} item={i} handle={p.handle} today={p.today} thumb={i.thumb_path ? p.thumbs[i.thumb_path] : undefined} onOpen={() => open(i)} />;
  return (
    <>
      <div className="ttfeed">
        {up.map(card)}
        {past.length > 0 && <div className="label">עלו כבר</div>}
        {past.map(card)}
      </div>
      {node}
    </>
  );
}

function TikTokCard({ item, handle, thumb, today, onOpen }: { item: ContentItem; handle: string; thumb?: string; today: string; onOpen: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const video = item.media.find((m) => m.kind === "video");
  return (
    <div className="ttcard" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
      {src && <video src={src} autoPlay controls playsInline loop />}
      {!thumb && !src && <span className="ttph">{item.title}</span>}
      <span className="ttdate num">{item.date === today ? "היום" : shortDate(item.date)}</span>
      {video && !src && (
        <button className="ttplay" aria-label="ניגון" onClick={async () => setSrc(await mediaStreamUrl(video.path))}><Play /></button>
      )}
      <button className="ttcap" onClick={onOpen}>
        <b dir="ltr">@{handle}</b>
        <span className="ttt">{item.title}</span>
        {item.caption && <span className="ttc">{item.caption}</span>}
      </button>
    </div>
  );
}

function Preview({ item, thumbs, onClose }: { item: ContentItem; thumbs: Record<string, string>; onClose: () => void }) {
  const src = item.thumb_path ? thumbs[item.thumb_path] : undefined;
  return (
    <Sheet onClose={onClose} label={item.title}>
      {src && <div className="pimg" style={{ backgroundImage: `url(${src})` }} />}
      <h2>{item.title}</h2>
      <div className="txt">{TYPE_LABEL[item.type]} · {shortDate(item.date)} · {STATUS_LABEL[item.status]}</div>
      {item.caption && <p className="pre">{item.caption}</p>}
    </Sheet>
  );
}
