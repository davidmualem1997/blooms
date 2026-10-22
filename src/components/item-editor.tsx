"use client";

import { useRef, useState, useTransition } from "react";
import { deleteItem, saveItem } from "@/app/(app)/c/[clientId]/gantt/actions";
import { uploadMedia, type MediaEntry } from "@/lib/media-client";
import { STATUS_LABEL, TYPE_LABEL, type ContentItem, type ContentStatus, type ContentType } from "@/lib/types";
import { Sheet } from "./sheet";
import { POST_STATS } from "@/lib/report-calc";
import { saveMedia } from "@/lib/share-media";

const TYPES = Object.keys(TYPE_LABEL) as ContentType[];
// "לבדיקה" הוסר מהבחירה (נשאר רק לפריטים ישנים שכבר בסטטוס הזה)
const STATUSES: ContentStatus[] = ["work", "client", "ok", "live"];

// אותם שדות כמו בדוח החודשי
const STAT_FIELDS: [string, string][] = POST_STATS.map((s) => [s.k, s.l]);
function readStats(form: FormData) {
  const out: Record<string, number> = {};
  for (const [k] of STAT_FIELDS) {
    const v = String(form.get(`stat-${k}`) ?? "").replace(/[^\d]/g, "");
    if (v) out[k] = Number(v);
  }
  return out;
}

// כותרת קצרה מהשורה הראשונה של הטקסט
const titleFrom = (text: string, fallback: string) => {
  const first = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return first ? (first.length > 40 ? first.slice(0, 38) + "…" : first) : fallback;
};

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
  const caption = useRef<HTMLTextAreaElement>(null);
  const [dlFor, setDlFor] = useState<string | null>(null);
  const [cover, setCover] = useState<{ path: string; thumb: string | null } | null>(it?.cover ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  async function addCover(file?: File) {
    if (!file) return;
    setCoverBusy(true);
    try {
      const entry = await uploadMedia(file, studioId, clientId, () => {});
      setCover({ path: entry.path, thumb: entry.thumb });
      setCoverPreview(URL.createObjectURL(file));
    } finally { setCoverBusy(false); }
  }
  const [toast, setToast] = useState("");
  const live = status === "live";

  function submit(form: FormData) {
    setError("");
    start(async () => {
      const res = await saveItem({
        id: it?.id,
        client_id: clientId,
        media: media.map(({ path, thumb, kind }) => ({ path, thumb, kind })),
        cover,
        stats: status === "live" ? readStats(form) : it?.stats,
        date: String(form.get("date")) || target.date,
        time: String(form.get("time") ?? "") || null,
        type,
        status,
        // אין שדה נושא: הכותרת היא השורה הראשונה של הטקסט (או מה שהיה)
        title: String(form.get("title") ?? "").trim() || titleFrom(String(form.get("caption") ?? ""), it?.title ?? target.preset?.title ?? ""),
        caption: String(form.get("caption") ?? ""),
        notes: live ? "" : String(form.get("notes") ?? ""),
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

  // שמירת כל הקבצים לטלפון (חלון השיתוף)
  async function saveAll() {
    setDlFor(null);
    for (const m of media) await saveMedia(m.path);
  }

  // העתקת הטקסט בלבד (בלי להוריד קובץ) – להדבקה באינסטגרם
  async function copyCaption() {
    setDlFor(null);
    const text = caption.current?.value ?? "";
    if (!text) return setToast("אין טקסט להעתקה");
    try { await navigator.clipboard.writeText(text); setToast("הטקסט הועתק ✓"); }
    catch { caption.current?.select(); setToast("סמנו והעתיקו את הטקסט"); }
  }

  function remove() {
    if (!it) return;
    if (!sure) return setSure(true);
    start(async () => { await deleteItem(clientId, it.id); onClose(); });
  }

  return (
    <Sheet onClose={onClose} label={it ? "עריכת תוכן" : "תוכן חדש"} busy={pending}>
      <form action={submit} className="stack">
        {live && (
          <div className="live-banner">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z" /><path d="M9.5 13.5l2 2 3.5-4" />
            </svg>
            <span><b className="w500">עלה לרשת</b><small>אפשר להזין כאן את הנתונים של הפוסט</small></span>
          </div>
        )}
        <div className="media-strip">
          {media.map((m, ix) => {
            const src = m.preview && m.kind === "image" ? m.preview : m.thumb ? thumbs[m.thumb] ?? m.preview : undefined;
            return (
              <div key={m.path} className="mtile">
                {m.kind === "video" && (m.preview || (!src && thumbs[m.path])) ? <video src={`${m.preview ?? thumbs[m.path]}#t=0.5`} muted playsInline preload="metadata" /> : src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני או blob מקומי, לא מתאים ל-next/image
                  <img src={src} alt="" />
                ) : <span className="mph">{m.kind === "video" ? "סרטון" : "תמונה"}</span>}
                {ix === 0 && media.length > 1 && <span className="mbadge">ראשי</span>}
                <button type="button" className="mx" aria-label="הסרת הקובץ" onClick={() => setMedia((all) => all.filter((x) => x.path !== m.path))}>×</button>
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
        {/* תמונת קאבר: מה שיופיע בפיד ובגאנט כתמונה הראשית */}
        <div className="cover-row">
          {cover ? (
            <div className="mtile cover-tile">
              {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני או blob מקומי */}
              <img src={coverPreview ?? (cover.thumb ? thumbs[cover.thumb] : undefined) ?? thumbs[cover.path]} alt="" />
              <span className="mbadge">קאבר</span>
              <button type="button" className="mx" aria-label="הסרת הקאבר" onClick={() => { setCover(null); setCoverPreview(null); }}>×</button>
            </div>
          ) : null}
          <label className="cover-add">
            <input type="file" accept="image/*" hidden onChange={(e) => { addCover(e.target.files?.[0]); e.target.value = ""; }} />
            {coverBusy ? "מעלים…" : cover ? "החלפת קאבר" : "+ תמונת קאבר"}
          </label>
        </div>
        {/* כותרת = נושא הפוסט (מה שמופיע בגאנט). ריק → השורה הראשונה של הטקסט. ליד: הורדה / העתקת טקסט */}
        <div className="ed-head">
          <input name="title" className="ed-title" defaultValue={it?.title ?? target.preset?.title ?? ""} placeholder={TYPE_LABEL[type]} aria-label="נושא" />
          <div className="ed-dl">
            <button type="button" className="ed-dl-btn" onClick={() => setDlFor(dlFor ? null : "all")} aria-label="הורדה" aria-expanded={!!dlFor}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></svg>
            </button>
            {dlFor && (
              <div className="dl-menu" role="menu">
                {media.length > 0 && <button type="button" role="menuitem" onClick={() => saveAll()}>שמירת {media.length > 1 ? `הקבצים (${media.length})` : media[0].kind === "video" ? "הסרטון" : "התמונה"}</button>}
                <button type="button" role="menuitem" onClick={() => copyCaption()}>העתקת הטקסט</button>
              </div>
            )}
          </div>
        </div>
        <textarea ref={caption} name="caption" className="caption-box" defaultValue={it?.caption ?? (it ? "" : target.preset?.title ?? "")} placeholder="הטקסט שיעלה עם הפוסט" aria-label="טקסט" />
        <div className="dt-row">
          <label className="field"><span className="label">תאריך</span><input name="date" type="date" defaultValue={it?.date ?? target.date} /></label>
          <label className="field"><span className="label">שעה (לתזכורת)</span><input name="time" type="time" defaultValue={it?.time?.slice(0, 5) ?? ""} /></label>
        </div>
        <div className="field"><span className="label">סוג</span>
          <div className="seg">{TYPES.map((t) => <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}</div>
        </div>
        <div className="field"><span className="label">סטטוס</span>
          <div className="seg">{(it?.status === "review" ? ["review" as ContentStatus, ...STATUSES] : STATUSES).map((s) => (
            <button type="button" key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
              <span className="sdot" style={{ ["--c" as string]: `var(--s-${s})` }} />{STATUS_LABEL[s]}
            </button>
          ))}</div>
        </div>
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
        {!live && <label className="field"><span className="label">הערות הלקוח</span><textarea name="notes" defaultValue={it?.notes ?? target.preset?.notes} placeholder="תיקונים שהלקוח ביקש" /></label>}
        {toast && <p className="txt" role="status">{toast}</p>}
        {error && <p className="error">{error}</p>}
        <div className="acts2">
          {it ? <button type="button" className="tbtn danger" onClick={remove} disabled={pending}>{sure ? "בטוח? לחיצה נוספת" : "מחיקה"}</button> : <span />}
          <button className="pbtn" disabled={pending || uploading}>{uploading ? "מעלים קבצים…" : pending ? "שומרים…" : "שמירה"}</button>
        </div>
      </form>
    </Sheet>
  );
}
