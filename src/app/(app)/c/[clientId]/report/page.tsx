import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { MONTHS, shortDate, todayIL } from "@/lib/dates";
import { loadMonthlyReport } from "@/lib/monthly-report";
import { BUSINESS_FIELDS, POST_STATS, fmt, type Kpi, type Post } from "@/lib/report-calc";
import { TYPE_LABEL } from "@/lib/types";
import { LINK_KINDS } from "@/lib/links";
import { Chevron } from "@/components/chevron";
import { LineChart } from "@/components/line-chart";
import { ReportEditor } from "./report-editor";

export const metadata = { title: "דוח חודשי · BLOOMS" };

const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// הדוח החודשי: מה קרה החודש, מה עבד, ומה זה אומר לעסק.
// הצוות רואה תמיד (ועורך); הלקוח רואה רק אחרי שהדוח פורסם
export default async function ReportPage({ params, searchParams }: PageProps<"/c/[clientId]/report">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) notFound();
  const isStaff = ctx.role !== "client";

  // ברירת מחדל: בתחילת החודש (עד ה-5) – החודש שהסתיים, שעליו כותבים את הדוח; אחר כך – החודש הנוכחי
  const today = todayIL();
  const [y, m, d] = today.split("-").map(Number);
  const defaultMonth = d <= 5 ? new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7) : today.slice(0, 7);
  const ym = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : defaultMonth;
  const r = await loadMonthlyReport(client, `${ym}-01`);
  const published = !!r.report?.published_at;
  const biz = BUSINESS_FIELDS[r.industry];
  const bizValues = biz.filter((f) => r.report?.business?.[f.k] != null);
  const canGoNext = r.nextMonth.slice(0, 7) <= today.slice(0, 7);

  const header = (
    <div className="stack tight">
      <h1 className="display-title">דוח חודשי</h1>
      <div className="mhead">
        <Link href={`?m=${r.prevMonth.slice(0, 7)}`} aria-label="החודש הקודם"><Chevron dir="back" /></Link>
        <h2>{monthName(r.month)}</h2>
        {canGoNext ? <Link href={`?m=${r.nextMonth.slice(0, 7)}`} aria-label="החודש הבא"><Chevron dir="forward" /></Link> : <span />}
      </div>
    </div>
  );

  if (!isStaff && !published) {
    return <div className="sec">{header}<p className="txt">הדוח של החודש הזה עוד בהכנה. נעדכן כשהוא מוכן.</p></div>;
  }

  const autoClicks = LINK_KINDS.filter((k) => r.linkClicks[k.k]);
  const empty = !r.kpis.length && !r.measured.length && !bizValues.length && !autoClicks.length;

  return (
    <div className="sec report">
      {header}

      {isStaff && (
        <div className="rstaff">
          <span className={`pill ${published ? "ok" : ""}`}>{published ? "פורסם ללקוח ✓" : "טיוטה – הלקוח עוד לא רואה"}</span>
          <ReportEditor clientId={clientId} month={r.month} industry={r.industry} metrics={r.metrics} report={r.report} suggestions={r.suggestions} published={published} />
        </div>
      )}

      {empty && <p className="empty">{isStaff ? "עוד אין נתונים לחודש הזה. לוחצים על \"עריכת הדוח\" ומזינים את המספרים מהתובנות של כל פלטפורמה." : "אין נתונים לחודש הזה."}</p>}

      {/* 1. תמונת מצב */}
      {r.kpis.length > 0 && (
        <section className="stack tight">
          <div className="label dotted">סיכום החודש</div>
          <div className="rkpis">{r.kpis.map((k) => <KpiCard key={k.k} k={k} />)}</div>
        </section>
      )}

      {/* 2. צמיחה בקהל */}
      {r.growth.end != null && (
        <section className="stack tight">
          <div className="label dotted">צמיחה בקהל</div>
          <div className="note rgrowth">
            <div className="gstats">
              <div><span className="txt">תחילת החודש</span><b className="num">{r.growth.start != null ? fmt(r.growth.start) : "—"}</b></div>
              <div><span className="txt">סוף החודש</span><b className="num">{fmt(r.growth.end)}</b></div>
              <div><span className="txt">נטו</span><b className={`num ${(r.growth.net ?? 0) >= 0 ? "up" : "down"}`}>{r.growth.net != null ? `${r.growth.net >= 0 ? "+" : ""}${fmt(r.growth.net)}` : "—"}</b></div>
              <div><span className="txt">צמיחה</span><b className="num">{r.growth.pct != null ? `${r.growth.pct}%` : "—"}</b></div>
            </div>
            {r.growth.unfollows != null && <span className="txt">{fmt(r.growth.unfollows)} הפסיקו לעקוב במהלך החודש</span>}
            {r.history.length > 1 && <LineChart rows={r.history.map((h) => ({ month: h.month, value: h.followers }))} label="עוקבים בכל הפלטפורמות לאורך החודשים" />}
            {r.growth.perPlatform.length > 1 && (
              <div className="row-gap">{r.growth.perPlatform.map((p) => (
                <span key={p.p.k} className="tag num">{p.p.l} {fmt(p.now!)}{p.before != null && ` (${p.now! - p.before >= 0 ? "+" : ""}${fmt(p.now! - p.before)})`}</span>
              ))}</div>
            )}
          </div>
        </section>
      )}

      {/* 3. התוכן המוביל – לפי מטרה */}
      {r.top.length > 0 && (
        <section className="stack tight">
          <div className="label dotted">התוכן שעבד הכי טוב</div>
          <div className="rtop">
            {r.top.map((t) => (
              <PostLink key={t.post.id} post={t.post} clientId={clientId} isStaff={isStaff} className="rtopcard">
                <span className="rthumb" style={t.post.thumb ? { backgroundImage: `url(${t.post.thumb})` } : undefined}>{t.post.thumb ? "" : TYPE_LABEL[t.post.type]}</span>
                <span className="goal">הכי טוב ל{t.goal}</span>
                <b className="w500">{t.post.title}</b>
                <span className="txt num">{t.why}</span>
              </PostLink>
            ))}
          </div>
          {r.weak.length > 0 && (
            <>
              <div className="label">עבד פחות טוב</div>
              <div className="note">{r.weak.map((p) => <PostRow key={p.id} p={p} clientId={clientId} isStaff={isStaff} />)}</div>
            </>
          )}
        </section>
      )}

      {/* 4. ביצועי כל התוכן */}
      {r.posts.length > 0 && (
        <section className="stack tight">
          <div className="label dotted">כל התוכן שעלה ({r.posts.length})</div>
          <div className="note">{r.posts.map((p) => <PostRow key={p.id} p={p} clientId={clientId} isStaff={isStaff} full />)}</div>
          {isStaff && r.posts.length > r.measured.length && <span className="txt">ל־{r.posts.length - r.measured.length} תכנים עוד אין נתונים. לוחצים על תוכן כדי להזין אותם.</span>}
        </section>
      )}

      {/* 5. תוצאה עסקית */}
      {(bizValues.length > 0 || autoClicks.length > 0) && (
        <section className="stack tight">
          <div className="label dotted">מה זה עשה לעסק</div>
          <div className="rkpis biz">
            {bizValues.map((f) => (
              <div key={f.k} className="kpi"><b className="num">{f.money ? "₪" : ""}{fmt(r.report!.business[f.k])}{f.pct ? "%" : ""}</b><span>{f.l}</span></div>
            ))}
            {autoClicks.map((k) => (
              <div key={k.k} className="kpi"><b className="num">{fmt(r.linkClicks[k.k])}</b><span>{k.report}</span><small className="txt">מקישורי BLOOMS</small></div>
            ))}
          </div>
        </section>
      )}

      {/* 6. תובנות ו-7. החודש הבא */}
      {(r.report?.insights.length ?? 0) > 0 && (
        <section className="stack tight">
          <div className="label dotted">מה למדנו החודש</div>
          <ul className="note rlist">{r.report!.insights.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>
      )}
      {(r.report?.next_steps.length ?? 0) > 0 && (
        <section className="stack tight">
          <div className="label dotted">מה עושים בחודש הבא</div>
          <ol className="note rlist steps">{r.report!.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      )}
    </div>
  );
}

function KpiCard({ k }: { k: Kpi }) {
  return (
    <div className="kpi">
      <b className="num">{k.money ? "₪" : ""}{k.k === "net" && k.value > 0 ? "+" : ""}{fmt(k.value)}{k.pct ? "%" : ""}</b>
      <span>{k.l}</span>
      {k.delta != null && <small className={`num ${k.delta >= 0 ? "up" : "down"}`}>{k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta)}% מהחודש הקודם</small>}
    </div>
  );
}

// צוות: לחיצה פותחת את התוכן בגאנט להזנת נתונים. לקוח: בלי קישור
function PostLink({ post, clientId, isStaff, className, children }: { post: Post; clientId: string; isStaff: boolean; className: string; children: React.ReactNode }) {
  return isStaff
    ? <Link href={`/c/${clientId}/gantt?m=${post.date.slice(0, 7)}&item=${post.id}`} className={className}>{children}</Link>
    : <div className={className}>{children}</div>;
}

function PostRow({ p, clientId, isStaff, full = false }: { p: Post; clientId: string; isStaff: boolean; full?: boolean }) {
  const stats = POST_STATS.filter((s) => p.stats[s.k] != null && (full || s.k === "reach" || s.k === "views"));
  return (
    <PostLink post={p} clientId={clientId} isStaff={isStaff} className="rpost">
      <span className="rthumb sm" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined}>{p.thumb ? "" : TYPE_LABEL[p.type]}</span>
      <span className="rpbody">
        <span className="w500">{p.title}</span>
        <span className="txt num">{TYPE_LABEL[p.type]} · {shortDate(p.date)}</span>
        {stats.length > 0
          ? <span className="rstats num">{stats.map((s) => <span key={s.k}><b>{fmt(p.stats[s.k]!)}</b> {s.l}</span>)}</span>
          : <span className="txt">{isStaff ? "עוד אין נתונים · להזנה" : "אין נתונים"}</span>}
      </span>
    </PostLink>
  );
}
