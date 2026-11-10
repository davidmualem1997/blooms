"use client";

import { useRef, useState, useTransition } from "react";
import { ContentIcon } from "@/components/content-icon";
import { Sheet } from "@/components/sheet";
import { MONTHS, parseISODate, shortDate } from "@/lib/dates";
import { uploadMedia } from "@/lib/media-client";
import type { Plan } from "@/lib/plan-extract";
import { TYPE_LABEL } from "@/lib/types";
import { importPlan, readPlanPdf } from "./plan-actions";

const WD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const dayLabel = (d: string) => `${WD[parseISODate(d).getUTCDay()]} ${shortDate(d)}`;
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// "ייבוא תכנון מ-PDF": טבלת דגשים, פוסטים ותכנון קדימה → ישר לגאנט, אחרי אישור
export function PlanImport({ clientId, studioId }: { clientId: string; studioId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "upload" | "read">("idle");
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<{ plan: Plan; dups: string[] } | null>(null);
  const [msg, setMsg] = useState("");

  async function onFile(f?: File) {
    if (!f) return;
    setMsg("");
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setMsg("צריך קובץ PDF");
    try {
      setStage("upload");
      const { path } = await uploadMedia(new File([f], "original.pdf", { type: "application/pdf" }), studioId, clientId, setProgress);
      setStage("read");
      const res = await readPlanPdf(clientId, path);
      setStage("idle");
      if (res.error || !res.plan) return setMsg(res.error ?? "משהו השתבש");
      const p = res.plan;
      if (!p.posts.length && !p.stories.length && !p.events.length && !p.highlights.length) return setMsg("לא מצאנו בקובץ תכנון עם תאריכים");
      setFound({ plan: p, dups: res.dups ?? [] });
    } catch {
      setStage("idle");
      setMsg("ההעלאה נכשלה. נסו שוב.");
    }
  }

  const busy = stage !== "idle";
  return (
    <>
      <button type="button" className="pdf-btn" onClick={() => input.current?.click()} disabled={busy}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3.5h8l4.5 4.5v12.5H6z" /><path d="M14 3.5V8h4.5" /><path d="M9 12.5h6M9 15.5h6M9 18.5h4" />
        </svg>
        <span className="pdf-body">
          <b className="w500">{stage === "upload" ? `מעלים… ${Math.round(progress * 100)}%` : stage === "read" ? "קוראים את התכנון…" : "ייבוא תכנון מ-PDF"}</b>
          <span className="txt">{stage === "read" ? "זה לוקח בערך חצי דקה" : "טבלת דגשים ופוסטים – נכנסת ישר לגאנט"}</span>
        </span>
        {busy && <span className="spinner" aria-hidden="true" />}
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {msg && <p className="txt">{msg}</p>}
      {found && <PlanReview clientId={clientId} {...found} onClose={(n) => { setFound(null); if (n) setMsg(`נכנסו לגאנט ${n} פריטים ✓`); }} />}
    </>
  );
}

function PlanReview({ clientId, plan, dups, onClose }: { clientId: string; plan: Plan; dups: string[]; onClose: (count?: number) => void }) {
  // ברירת מחדל: הכול מסומן, חוץ ממה שכבר קיים בגאנט
  const all = [...plan.highlights.map((_, i) => `h${i}`), ...plan.posts.map((_, i) => `p${i}`), ...plan.stories.map((_, i) => `s${i}`), ...plan.events.map((_, i) => `e${i}`)];
  const [picked, setPicked] = useState(() => new Set(all.filter((k) => !dups.includes(k))));
  const [err, setErr] = useState("");
  const [saving, start] = useTransition();
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const byDate = <T extends { date: string }>(xs: T[], pre: string) => xs.map((x, i) => ({ x, k: `${pre}${i}` })).sort((a, b) => a.x.date.localeCompare(b.x.date));

  const row = (k: string, head: React.ReactNode, title: string, sub?: string) => (
    <label key={k} className="pdf-row">
      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />
      <span className="pdf-field">
        <b className="w500">{head} {dups.includes(k) && <span className="tag">כבר בגאנט</span>}</b>
        <span>{title}</span>
        {sub && <span className="pdf-val">{sub}</span>}
      </span>
    </label>
  );

  const save = () => start(async () => {
    const pick = <T,>(xs: T[], pre: string) => xs.filter((_, i) => picked.has(`${pre}${i}`));
    const res = await importPlan(clientId, { highlights: pick(plan.highlights, "h"), posts: pick(plan.posts, "p"), stories: pick(plan.stories, "s"), events: pick(plan.events, "e") });
    if (res.error) setErr(res.error); else onClose(res.count);
  });

  return (
    <Sheet onClose={() => onClose()} label="מה מצאנו בתכנון" busy={saving}>
      <h2>מה מצאנו בתכנון</h2>
      <span className="txt">מסמנים מה להכניס לגאנט. פוסטים נכנסים בסטטוס &quot;בעבודה&quot;; את הקבצים מעלים אחר כך בעריכה.</span>
      {plan.highlights.length > 0 && <>
        <div className="label dotted">דגשים לחודש</div>
        <div className="note">{plan.highlights.map((h, i) => row(`h${i}`, monthLabel(h.month), h.text))}</div>
      </>}
      {plan.posts.length > 0 && <>
        <div className="label dotted">פוסטים, רילס וטיקטוק</div>
        <div className="note">{byDate(plan.posts, "p").map(({ x, k }) => row(k, <><ContentIcon kind={x.type} size={12} /> {TYPE_LABEL[x.type]} · {dayLabel(x.date)}{x.time ? ` · ${x.time}` : ""}</>, x.title, [x.caption, x.notes].filter(Boolean).join("\n").slice(0, 160)))}</div>
      </>}
      {plan.stories.length > 0 && <>
        <div className="label dotted">סטוריז</div>
        <div className="note">{byDate(plan.stories, "s").map(({ x, k }) => row(k, <><ContentIcon kind="story" size={12} /> {dayLabel(x.date)}</>, x.title))}</div>
      </>}
      {plan.events.length > 0 && <>
        <div className="label dotted">אירועים ומועדים</div>
        <div className="note">{byDate(plan.events, "e").map(({ x, k }) => row(k, <><ContentIcon kind="event" size={12} /> {dayLabel(x.date)}</>, x.title))}</div>
      </>}
      {err && <p className="error">{err}</p>}
      <div className="acts2">
        <span className="txt">{picked.size} פריטים נבחרו</span>
        <button className="pbtn" onClick={save} disabled={saving || !picked.size}>{saving ? "מכניסים…" : "הכנסה לגאנט"}</button>
      </div>
    </Sheet>
  );
}
