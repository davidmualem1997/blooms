"use client";

import { useState } from "react";
import { saveItem } from "@/app/(app)/c/[clientId]/gantt/actions";
import { uploadMedia } from "@/lib/media-client";
import { parseISODate, toISODate } from "@/lib/dates";

// כפתור + בפיד: כל קובץ נהיה פריט חדש, 3 ימים אחרי הפריט האחרון בפיד
export function BulkUpload({ clientId, studioId, lastDate, today, tiktok }: {
  clientId: string; studioId: string; lastDate: string | null; today: string; tiktok: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    let date = lastDate && lastDate > today ? lastDate : today;
    const list = Array.from(files);
    let n = 0;
    for (const file of list) {
      n++;
      const d = parseISODate(date);
      d.setUTCDate(d.getUTCDate() + 3);
      date = toISODate(d);
      try {
        const entry = await uploadMedia(file, studioId, clientId, (p) =>
          setStatus(`מעלים ${n}/${list.length} · ${Math.round(p * 100)}%`));
        await saveItem({
          client_id: clientId,
          date,
          type: tiktok ? "tiktok" : entry.kind === "video" ? "reel" : "post",
          status: "work",
          title: file.name.replace(/\.[^.]+$/, ""),
          caption: "",
          notes: "",
          media: [entry],
        });
      } catch {
        setStatus(`ההעלאה של ${file.name} נכשלה`);
        return;
      }
    }
    setStatus(list.length === 1 ? "נוסף לפיד" : `נוספו ${list.length} לפיד`);
    setTimeout(() => setStatus(null), 2500);
  }

  return (
    <>
      <label className="fab" aria-label={tiktok ? "העלאת סרטוני טיקטוק" : "העלאת תמונות וסרטונים"}>
        +
        <input type="file" accept={tiktok ? "video/*" : "image/*,video/*"} multiple hidden
          onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {status && <div className="toast" role="status">{status}</div>}
    </>
  );
}
