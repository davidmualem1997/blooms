"use client";

import { useState, useTransition } from "react";
import { deleteItem, mediaUrl, saveItem } from "@/app/(app)/c/[clientId]/gantt/actions";
import { uploadMedia, type MediaEntry } from "@/lib/media-client";
import { STATUS_LABEL, TYPE_LABEL, type ContentItem, type ContentStatus, type ContentType } from "@/lib/types";
import { Sheet } from "./sheet";

const TYPES = Object.keys(TYPE_LABEL) as ContentType[];
const STATUSES = Object.keys(STATUS_LABEL) as ContentStatus[];

const STAT_FIELDS: [string, string][] = [["views", "צפיות"], ["reach", "חשיפה"], ["likes", "לייקים"], ["comments", "תגובות"], ["saves", "שמירות"], ["shares", "שיתופים"]];
function readStats(form: FormData) {
  const out: Record<string, number> = {};
  for (const [k] of STAT_FIELDS) {
    const v = String(form.get(`stat-${k}`) ?? "").replace(/[^\d]/g, "");
    if (v) out[k] = Number(v);
  }
  return out;
}

export type EditorTarget = { item?: ContentItem; date: string; type?: ContentType; preset?: { title?: string; notes?: string } };

export function ItemEditor({ clientId, studioId, thumbs, target, onClose }: {
  clientId: string; studioId: string; thumbs: Record<string, string>; target: EditorTarget; onClose: () => void;
}) {
  const it = target.item;
  const [media, setMedia] = useState<(MediaEntry & { preview?: string })[]>(it?.media ?? []);
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number; error?: string }[]>([]);
  const uploading = uploads.some((u) => !u.error);
  const [type, setType] = useState<ContentType>(it?.type ?? target.type ?? "post");
  const [status, setStatus] = useState<ContentStatus>(it?.status ?? "work");
  const [error, setError] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  function submit(form: FormData) {
    setError("");
    start(async () => {
      const res = await saveItem({
        id: it?.id,
        client_id: clientId,
        media: media.map(({ path, thumb, kind }) => ({ path, thumb, kind })),
        stats: status === "live" ? readStats(form) : it?.stats,
        date: String(form.get("date")) || target.date,
        type,
        status,
        title: String(form.get("title") ?? ""),
        caption: String(form.get("caption") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
      if (res.error) setError(res.error);
      else onClose();
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    if (list.some((f) => f.type.startsWith("video")) && type === "post") setType("reel");
    await Promise.all(list.map(async (file) => {
      const id = crypto.randomUUID();
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
      try {
        const entry = await uploadMedia(file, studioId, clientId, (p) =>
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))));
        setMedia((m) => [...m, { ...entry, preview: URL.createObjectURL(file) }]);
        setUploads((u) => u.filter((x) => x.id !== id));
      } catch {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: "ההעלאה נכשלה. ייתכן שהקובץ גדול מהמגבלה של Supabase." } : x)));
      }
    }));
  }

  async function download(path: string) {
    const url = await mediaUrl(path);
    if (url) window.open(url, "_blank");
  }

  function remove() {
    if (!it) return;
    if (!sure) return setSure(true);
    start(async () => { await deleteItem(clientId, it.id); onClose(); });
  }

  return (
    <Sheet onClose={onClose} label={it ? "עריכת תוכן" : "תוכן חדש"} busy={pending}>
      <form action={submit} className="stack">
        <h2>{it ? "עריכת תוכן" : "תוכן חדש"}</h2>
        <div className="media-strip">
          {media.map((m, ix) => {
            const src = m.preview && m.kind === "image" ? m.preview : m.thumb ? thumbs[m.thumb] ?? m.preview : undefined;
            return (
              <div key={m.path} className="mtile">
                {m.kind === "video" && m.preview ? <video src={m.preview} muted playsInline /> : src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני או blob מקומי, לא מתאים ל-next/image
                  <img src={src} alt="" />
                ) : <span className="mph">{m.kind === "video" ? "סרטון" : "תמונה"}</span>}
                {ix === 0 && media.length > 1 && <span className="mbadge">ראשי</span>}
                <button type="button" className="mx" aria-label="הסרת הקובץ" onClick={() => setMedia((all) => all.filter((x) => x.path !== m.path))}>×</button>
                <button type="button" className="mdl" onClick={() => download(m.path)}>הורדה</button>
              </div>
            );
          })}
          {uploads.map((u) => (
            <div key={u.id} className="mtile uploading">
              <span className="mph">{u.error ?? `${Math.round(u.progress * 100)}%`}</span>
              {!u.error && <i className="mprog" style={{ width: `${u.progress * 100}%` }} />}
              {u.error && <button type="button" className="mx" aria-label="סגירה" onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}>×</button>}
            </div>
          ))}
          <label className="mtile add">
            <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <span>+</span><small>תמונה או סרטון</small>
          </label>
        </div>
        <input name="title" placeholder="נושא" defaultValue={it?.title ?? target.preset?.title} aria-label="נושא" autoFocus={!it} />
        <label className="field"><span className="label">תאריך</span><input name="date" type="date" defaultValue={it?.date ?? target.date} /></label>
        <div className="field"><span className="label">סוג</span>
          <div className="seg">{TYPES.map((t) => <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}</div>
        </div>
        <div className="field"><span className="label">סטטוס</span>
          <div className="seg">{STATUSES.map((s) => (
            <button type="button" key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
              <span className="sdot" style={{ ["--c" as string]: `var(--s-${s})` }} />{STATUS_LABEL[s]}
            </button>
          ))}</div>
        </div>
        <label className="field"><span className="label">טקסט</span><textarea name="caption" defaultValue={it?.caption} placeholder="הטקסט שיעלה עם הפוסט" /></label>
        {status === "live" && (
          <fieldset className="field">
            <legend className="label">ביצועים (מהתובנות של הפלטפורמה)</legend>
            <div className="three">
              {STAT_FIELDS.map(([k, l]) => (
                <input key={k} name={`stat-${k}`} inputMode="numeric" placeholder={l} aria-label={l} defaultValue={it?.stats?.[k] ?? ""} />
              ))}
            </div>
          </fieldset>
        )}
        <label className="field"><span className="label">הערות הלקוח</span><textarea name="notes" defaultValue={it?.notes ?? target.preset?.notes} placeholder="תיקונים שהלקוח ביקש" /></label>
        {error && <p className="error">{error}</p>}
        <div className="acts2">
          {it ? <button type="button" className="tbtn danger" onClick={remove} disabled={pending}>{sure ? "בטוח? לחיצה נוספת" : "מחיקה"}</button> : <span />}
          <button className="pbtn" disabled={pending || uploading}>{uploading ? "מעלים קבצים…" : pending ? "שומרים…" : "שמירה"}</button>
        </div>
      </form>
    </Sheet>
  );
}
