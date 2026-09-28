"use client";

import { useState, useTransition } from "react";
import { saveMetrics, type MetricInput } from "@/app/(app)/c/[clientId]/report/actions";
import { MONTHS, shortDate } from "@/lib/dates";
import type { BestPost, MetricRow } from "@/lib/report";
import { TYPE_LABEL } from "@/lib/types";
import { Sheet } from "./sheet";

const PLATFORMS = [
  { k: "instagram", l: "אינסטגרם" },
  { k: "facebook", l: "פייסבוק" },
  { k: "tiktok", l: "טיקטוק" },
] as const;
const nf = new Intl.NumberFormat("he-IL");
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)}׳ ${m.slice(2, 4)}`;

// "דוח נתונים": עוקבים עכשיו ומאז תחילת העבודה, גרף לכל פלטפורמה והפוסטים שעבדו הכי טוב
export function DataReport({ clientId, metrics, bestMonth, bestHalf, canEdit, today }: {
  clientId: string; metrics: MetricRow[]; bestMonth: BestPost[]; bestHalf: BestPost[]; canEdit: boolean; today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const series = PLATFORMS.map((p) => ({ ...p, rows: metrics.filter((m) => m.platform === p.k && m.followers != null) }));
  const totalNow = series.reduce((n, s) => n + (s.rows.at(-1)?.followers ?? 0), 0);
  const totalStart = series.reduce((n, s) => n + (s.rows[0]?.followers ?? 0), 0);

  const growth = totalNow - totalStart;
  return (
    <>
      <button className="report-chip" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="rc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg>
        </span>
        <span className="rc-body">
          <b className="w500">דוח נתונים</b>
          <span className="txt num">
            {totalNow > 0
              ? `${nf.format(totalNow)} עוקבים · ${growth >= 0 ? "+" : ""}${nf.format(growth)} מאז ההתחלה`
              : canEdit ? "עוד אין נתונים · להזנת נתוני החודש" : "עוד אין נתונים"}
          </span>
        </span>
        <span className="rc-plat">
          {series.filter((s) => s.rows.length).map((s) => <span key={s.k} className="tag num">{s.l.slice(0, 3)}׳ {nf.format(s.rows.at(-1)!.followers ?? 0)}</span>)}
        </span>
      </button>
      {open && (
      <Sheet onClose={() => setOpen(false)} label="דוח נתונים">
      <h2>דוח נתונים</h2>
      <div className="stack">
        {metrics.length === 0 && <p className="empty">עוד אין נתונים. {canEdit ? "הזינו את נתוני החודש כדי להתחיל לעקוב." : "הצוות יעדכן אותם בקרוב."}</p>}
        <div className="rgrid">
          {series.filter((s) => s.rows.length).map((s) => {
            const now = s.rows.at(-1)!;
            const start = s.rows[0];
            const growth = (now.followers ?? 0) - (start.followers ?? 0);
            return (
              <div key={s.k} className="rcard">
                <div className="sechead"><b className="w500">{s.l}</b><span className="txt">{monthLabel(now.month)}</span></div>
                <div className="hero-num num">{nf.format(now.followers ?? 0)}</div>
                <div className="txt">עוקבים · <span className={growth >= 0 ? "up" : "down"}>{growth >= 0 ? "+" : ""}{nf.format(growth)}</span> מאז {monthLabel(start.month)}</div>
                {s.rows.length > 1 && <LineChart rows={s.rows} label={`עוקבים ב${s.l}`} />}
                {now.reach != null && <div className="txt">חשיפה בחודש האחרון: <b className="num">{nf.format(now.reach)}</b>{now.interactions != null && <> · אינטראקציות: <b className="num">{nf.format(now.interactions)}</b></>}</div>}
                <details className="tableview"><summary className="edit">הצגה כטבלה</summary>
                  <table><thead><tr><th>חודש</th><th>עוקבים</th><th>חשיפה</th><th>אינטראקציות</th></tr></thead>
                    <tbody>{s.rows.map((r) => <tr key={r.month}><td>{monthLabel(r.month)}</td><td className="num">{r.followers != null ? nf.format(r.followers) : "—"}</td><td className="num">{r.reach != null ? nf.format(r.reach) : "—"}</td><td className="num">{r.interactions != null ? nf.format(r.interactions) : "—"}</td></tr>)}</tbody>
                  </table>
                </details>
              </div>
            );
          })}
        </div>

        <BestList title="הפוסטים שעבדו הכי טוב בחודש האחרון" posts={bestMonth} />
        <BestList title="הפוסטים שעבדו הכי טוב בחצי השנה האחרונה" posts={bestHalf} />
        {canEdit && <span className="txt">את החשיפה של כל פוסט מזינים בעורך הפריט, אחרי שהוא עלה.</span>}
        {canEdit && <button className="edit" onClick={() => { setOpen(false); setEditing(true); }}>עדכון נתוני החודש</button>}
      </div>
      </Sheet>
      )}
      {editing && <MetricsSheet clientId={clientId} today={today} metrics={metrics} onClose={() => setEditing(false)} />}
    </>
  );
}

function BestList({ title, posts }: { title: string; posts: BestPost[] }) {
  if (!posts.length) return null;
  return (
    <div className="stack">
      <div className="label">{title}</div>
      {posts.map((p, i) => (
        <div key={p.id} className="best">
          <span className="rank num">{i + 1}</span>
          <span className="thumb" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined}>{p.thumb ? "" : TYPE_LABEL[p.type]}</span>
          <span className="tx col"><span className="t">{p.title}</span><span className="txt num">{TYPE_LABEL[p.type]} · {shortDate(p.date)}</span></span>
          <b className="num">{nf.format(p.score)}</b>
        </div>
      ))}
    </div>
  );
}

// גרף קו פשוט: סדרה אחת, קו 2px, נקודות עם תווית בריחוף, רשת עדינה
function LineChart({ rows, label }: { rows: MetricRow[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 110, P = { t: 12, r: 10, b: 22, l: 10 };
  const vals = rows.map((r) => r.followers ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(rows.length - 1, 1);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const d = rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.followers ?? 0)}`).join(" ");
  return (
    <svg className="lchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ direction: "ltr" }}>
      {[0, 0.5, 1].map((f) => <line key={f} x1={P.l} x2={W - P.r} y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)} className="grid" />)}
      <path d={d} className="line" />
      {rows.map((r, i) => (
        <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
          <rect x={x(i) - 14} y={0} width={28} height={H} fill="transparent" />
          <circle cx={x(i)} cy={y(r.followers ?? 0)} r={hover === i || i === rows.length - 1 ? 4.5 : 3} className="pt" />
          <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{monthLabel(r.month)}</text>
          {hover === i && <text x={Math.min(Math.max(x(i), 40), W - 40)} y={Math.max(y(r.followers ?? 0) - 9, 10)} textAnchor="middle" className="tip">{nf.format(r.followers ?? 0)}</text>}
        </g>
      ))}
    </svg>
  );
}

function MetricsSheet({ clientId, today, metrics, onClose }: { clientId: string; today: string; metrics: MetricRow[]; onClose: () => void }) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const [month, setMonth] = useState(prev);
  const [pending, start] = useTransition();
  const existing = (p: string) => metrics.find((r) => r.platform === p && r.month === month);
  const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(String(v).replace(/[^\d]/g, "")));
  return (
    <Sheet onClose={onClose} label="עדכון נתוני החודש" busy={pending}>
      <form className="stack" key={month} action={(fd) => start(async () => {
        const rows: MetricInput[] = PLATFORMS.map((p) => ({ platform: p.k, followers: num(fd.get(`${p.k}-f`)), reach: num(fd.get(`${p.k}-r`)), interactions: num(fd.get(`${p.k}-i`)) }));
        await saveMetrics(clientId, month, rows);
        onClose();
      })}>
        <h2>נתוני החודש</h2>
        <label className="field"><span className="label">חודש</span>
          <input type="month" value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)} />
        </label>
        {PLATFORMS.map((p) => (
          <fieldset key={p.k} className="field">
            <legend className="label">{p.l}</legend>
            <div className="three">
              <input name={`${p.k}-f`} inputMode="numeric" placeholder="עוקבים" defaultValue={existing(p.k)?.followers ?? ""} aria-label={`עוקבים ב${p.l}`} />
              <input name={`${p.k}-r`} inputMode="numeric" placeholder="חשיפה" defaultValue={existing(p.k)?.reach ?? ""} aria-label={`חשיפה ב${p.l}`} />
              <input name={`${p.k}-i`} inputMode="numeric" placeholder="אינטראקציות" defaultValue={existing(p.k)?.interactions ?? ""} aria-label={`אינטראקציות ב${p.l}`} />
            </div>
          </fieldset>
        ))}
        <span className="txt">את המספרים לוקחים מהתובנות (Insights) של כל פלטפורמה. שדה ריק לא נשמר.</span>
        <div className="acts2"><span /><button className="pbtn" disabled={pending}>שמירה</button></div>
      </form>
    </Sheet>
  );
}
