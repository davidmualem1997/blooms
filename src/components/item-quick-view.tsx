"use client";

import { useState } from "react";
import { mediaUrl } from "@/app/(app)/c/[clientId]/gantt/actions";
import { TYPE_LABEL, type ContentItem } from "@/lib/types";
import { Sheet } from "./sheet";

// חלונית "מה מעלים": הורדת הקבצים המקוריים והעתקת הטקסט, בלי להיכנס לעורך
export function ItemQuickView({ item, thumbs, done, onToggle, onClose }: {
  item: ContentItem; thumbs: Record<string, string>; done: boolean; onToggle: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function download(path: string) {
    setLoading(path);
    const url = await mediaUrl(path);
    setLoading(null);
    if (url) window.open(url, "_blank");
  }

  return (
    <Sheet onClose={onClose} label={item.title}>
      <div className="sechead"><h2>{item.title}</h2><span className={`tag${item.type === "tiktok" ? " tt" : ""}`}>{TYPE_LABEL[item.type]}</span></div>
      {item.media.length > 0 ? (
        <div className="media-strip">
          {item.media.map((m) => {
            const src = m.thumb ? thumbs[m.thumb] : undefined;
            return (
              <button key={m.path} type="button" className="mtile" onClick={() => download(m.path)} aria-label="הורדת הקובץ">
                {src
                  // eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני
                  ? <img src={src} alt="" />
                  : <span className="mph">{m.kind === "video" ? "סרטון" : "תמונה"}</span>}
                <span className="mdl">{loading === m.path ? "…" : "הורדה"}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="empty">עוד לא הועלו קבצים לפריט הזה</p>}
      {item.media.length > 1 && <span className="txt">לחיצה על כל קובץ מורידה אותו. בקרוסלה – לפי הסדר.</span>}

      <div className="field">
        <span className="label">טקסט</span>
        {item.caption ? <p className="pre copybox">{item.caption}</p> : <span className="txt">אין טקסט</span>}
      </div>
      <div className="acts2">
        <button className="tbtn" onClick={onToggle}>{done ? "ביטול הסימון" : "סימון שעלה ✓"}</button>
        {item.caption && (
          <button className="pbtn" onClick={() => navigator.clipboard?.writeText(item.caption).then(() => setCopied(true))}>
            {copied ? "הטקסט הועתק" : "העתקת הטקסט"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
