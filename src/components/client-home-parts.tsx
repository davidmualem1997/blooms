"use client";

import { useState, useTransition } from "react";
import { reviewItem } from "@/app/(app)/c/[clientId]/inspiration/actions";
import { sendRequest } from "@/app/(app)/c/[clientId]/requests/actions";
import { uploadMedia } from "@/lib/media-client";
import { parseISODate, shortDate } from "@/lib/dates";
import { MESSAGE_LABEL, REQUEST_STATUS, STATUS_LABEL, TYPE_LABEL, type Attachment, type ContentItem, type Message } from "@/lib/types";
import { Chevron } from "./chevron";
import { Sheet } from "./sheet";

const WD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const dayLabel = (d: string) => `${WD[parseISODate(d).getUTCDay()]} ${shortDate(d)}`;

// "צריך ממך": הדבר הראשון בעמוד – כמה פריטים מחכים לאישור, ומעבר לאישורים
export function NeedsYou({ clientId, items, thumbs, deadline }: { clientId: string; items: ContentItem[]; thumbs: Record<string, string>; deadline: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="needs">
      <div className="label dotted">צריך ממך</div>
      <div className="needs-row">
        <div>
          <b className="needs-title">{items.length === 1 ? "פריט אחד מחכה לאישור" : `${items.length} פריטים מחכים לאישור`}</b>
          <div className="txt">אישור סופי עד {deadline}</div>
        </div>
        <div className="needs-thumbs">
          {items.slice(0, 3).map((i) => (
            <span key={i.id} className="nthumb" style={i.thumb_path && thumbs[i.thumb_path] ? { backgroundImage: `url(${thumbs[i.thumb_path]})` } : undefined}>
              {i.thumb_path && thumbs[i.thumb_path] ? "" : TYPE_LABEL[i.type]}
            </span>
          ))}
        </div>
      </div>
      <button className="pbtn wide" onClick={() => setOpen(true)}>לעבור לאישורים <Chevron dir="forward" size={14} /></button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="אישורים">
          <h2>לאישור</h2>
          <div className="stack">{items.map((i) => <ApprovalCard key={i.id} clientId={clientId} item={i} thumb={i.thumb_path ? thumbs[i.thumb_path] : undefined} />)}</div>
        </Sheet>
      )}
    </section>
  );
}

export function ApprovalCard({ clientId, item, thumb }: { clientId: string; item: ContentItem; thumb?: string }) {
  const [fixing, setFixing] = useState(false);
  const [done, setDone] = useState<"" | "ok" | "fix">("");
  const [pending, start] = useTransition();
  if (done) return <div className="card appr"><span className="used-tag">{done === "ok" ? `"${item.title}" אושר ✓` : `התיקון על "${item.title}" נשלח לצוות`}</span></div>;
  return (
    <div className="card appr">
      <div className="item">
        <span className="thumb big" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>{thumb ? "" : TYPE_LABEL[item.type]}</span>
        <span className="tx col"><span className="t">{item.title}</span><span className="txt num">{TYPE_LABEL[item.type]} · {dayLabel(item.date)}</span></span>
        <span />
      </div>
      {item.caption && <p className="pre">{item.caption}</p>}
      {fixing ? (
        <form className="stack" action={(fd) => start(async () => { await reviewItem(clientId, item.id, false, String(fd.get("note") ?? "")); setDone("fix"); })}>
          <textarea name="note" rows={3} defaultValue={item.notes} placeholder="מה לתקן? למשל: להחליף את התמונה השנייה" required autoFocus />
          <div className="acts2"><button type="button" className="tbtn" onClick={() => setFixing(false)}>ביטול</button><button className="pbtn" disabled={pending}>שליחת התיקון</button></div>
        </form>
      ) : (
        <div className="acts2">
          <button className="tbtn" onClick={() => setFixing(true)} disabled={pending}>יש לי תיקון</button>
          <button className="pbtn" disabled={pending} onClick={() => start(async () => { await reviewItem(clientId, item.id, true); setDone("ok"); })}>{pending ? "רגע…" : "מאשר/ת"}</button>
        </div>
      )}
    </div>
  );
}

// "עולה היום": כרטיס אחד עם תמונה, סוג וסטטוס; לחיצה פותחת את התוכן
export function TodayCard({ item, thumb }: { item: ContentItem; thumb?: string }) {
  const [open, setOpen] = useState(false);
  const status = item.status === "live" ? "עלה ✓" : item.status === "ok" ? "מתוזמן" : STATUS_LABEL[item.status];
  return (
    <>
      <button className="today-card" onClick={() => setOpen(true)}>
        <span className="tc-img" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>{thumb ? "" : TYPE_LABEL[item.type]}</span>
        <span className="tc-body">
          <span className="txt">{TYPE_LABEL[item.type]}</span>
          <b className="tc-title">{item.title}</b>
          <span className={`tc-status ${item.status}`}>{status}</span>
        </span>
        <span className="arrow"><Chevron dir="forward" /></span>
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label={item.title}>
          {thumb && <div className="pimg" style={{ backgroundImage: `url(${thumb})` }} />}
          <h2>{item.title}</h2>
          <div className="txt">{TYPE_LABEL[item.type]} · {status}</div>
          {item.caption && <p className="pre">{item.caption}</p>}
        </Sheet>
      )}
    </>
  );
}

const KINDS = [
  { k: "request", l: "בקשה", ph: "מה תרצו שנעשה?" },
  { k: "fix", l: "תיקון", ph: "מה לתקן, ובאיזה פוסט?" },
  { k: "idea", l: "רעיון לתוכן", ph: "הרעיון, או קישור לריל או לפין שאהבתם" },
  { k: "call", l: "נושא לפגישה", ph: "על מה תרצו לדבר בפגישה הבאה?" },
] as const;

// כפתור + צף בכל מסכי הלקוח: פנייה לצוות – בקשה, תיקון, רעיון לתוכן או נושא לפגישה
export function SendToTeam({ clientId, studioId, history }: { clientId: string; studioId: string; history: Message[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("request");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      const entries = await Promise.all(Array.from(list).map((f) => uploadMedia(f, studioId, clientId, () => {})));
      setFiles((x) => [...x, ...entries.map((e) => ({ path: e.path, thumb: e.thumb, kind: e.kind }))]);
    } catch {
      setError("לא הצלחנו לצרף את הקובץ");
    } finally {
      setUploading(false);
    }
  }

  function submit(fd: FormData) {
    const text = String(fd.get("t") ?? "").trim();
    if (!text) return;
    setError("");
    start(async () => {
      const res = await sendRequest(clientId, kind, text, files);
      if (res.error) return setError(res.error);
      setFiles([]);
      setSent(KINDS.find((x) => x.k === kind)!.l);
    });
  }

  return (
    <>
      <button className="fab-plus" aria-label="פנייה לצוות" onClick={() => { setOpen(true); setSent(""); }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="פנייה לצוות" busy={pending || uploading}>
          {sent ? (
            <>
              <h2>נשלח ✓</h2>
              <p className="txt big">ה{sent} הגיע/ה לצוות שמטפל בכם. אפשר לעקוב אחרי הסטטוס ב״כל הפניות״.</p>
              <div className="acts2"><button className="tbtn" onClick={() => setSent("")}>פנייה נוספת</button><a className="pbtn" href={`/c/${clientId}/requests`}>לכל הפניות</a></div>
            </>
          ) : (
            <form className="stack" action={submit}>
              <h2>מה תרצו לשלוח?</h2>
              <div className="seg">{KINDS.map((x) => <button key={x.k} type="button" aria-pressed={kind === x.k} onClick={() => setKind(x.k)}>{x.l}</button>)}</div>
              <textarea name="t" rows={5} placeholder={KINDS.find((x) => x.k === kind)!.ph} aria-label="הפנייה" required />
              <div className="media-strip">
                {files.map((f) => (
                  <div key={f.path} className="mtile"><span className="mph">{f.kind === "video" ? "סרטון" : "קובץ"} ✓</span>
                    <button type="button" className="mx" aria-label="הסרה" onClick={() => setFiles((x) => x.filter((y) => y.path !== f.path))}>×</button></div>
                ))}
                <label className="mtile add"><input type="file" accept="image/*,video/*,application/pdf" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
                  <span>{uploading ? "…" : "+"}</span><small>צירוף קובץ</small></label>
              </div>
              {error && <p className="error">{error}</p>}
              <div className="acts2"><span /><button className="pbtn" disabled={pending || uploading}>{pending ? "שולחים…" : "שליחה"}</button></div>
              {history.length > 0 && (
                <div className="field"><span className="label">פניות אחרונות</span>
                  <div className="note soft">
                    {history.slice(0, 3).map((h) => (
                      <div key={h.id} className="soon">
                        <span>{h.body.length > 40 ? h.body.slice(0, 40) + "…" : h.body}</span>
                        <span className={`rstatus ${h.status}`}>{MESSAGE_LABEL[h.kind]} · {REQUEST_STATUS[h.status]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
