"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import type { Industry } from "@/lib/holidays";
import type { ReportRow } from "@/lib/monthly-report";
import { BUSINESS_FIELDS, METRIC_FIELDS, PLATFORMS, type Metric, type MetricKey } from "@/lib/report-calc";
import { saveReport, setReportPublished } from "./actions";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[^\d.]/g, "");
  return s === "" ? null : Number(s);
};
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// עריכת הדוח (צוות): מספרים מהתובנות של כל פלטפורמה, תוצאה עסקית, תובנות ומה עושים בחודש הבא
export function ReportEditor({ clientId, month, industry, metrics, report, suggestions, published }: {
  clientId: string; month: string; industry: Industry; metrics: Metric[]; report: ReportRow | null;
  suggestions: { insights: string[]; nextSteps: string[] }; published: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState((report?.insights ?? []).join("\n"));
  const [steps, setSteps] = useState((report?.next_steps ?? []).join("\n"));
  const [pending, start] = useTransition();
  const biz = BUSINESS_FIELDS[industry];
  const addLine = (cur: string, line: string) => (cur.split("\n").includes(line) ? cur : [cur.trim(), line].filter(Boolean).join("\n"));

  return (
    <>
      <span className="row-gap">
        <button className="tbtn" onClick={() => start(() => setReportPublished(clientId, month, !published))} disabled={pending}>
          {published ? "ביטול הפרסום" : "פרסום ללקוח"}
        </button>
        <button className="pbtn" onClick={() => setOpen(true)}>עריכת הדוח</button>
      </span>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="עריכת הדוח" busy={pending}>
          <form className="stack" action={(fd) => start(async () => {
            setError("");
            const res = await saveReport(clientId, month, {
              metrics: PLATFORMS.map((p) => ({ platform: p.k, ...(Object.fromEntries(METRIC_FIELDS.map((f) => [f.k, num(fd.get(`${p.k}-${f.k}`))])) as Partial<Record<MetricKey, number | null>>) })),
              business: Object.fromEntries(biz.map((f) => [f.k, num(fd.get(`biz-${f.k}`))]).filter(([, v]) => v != null)) as Record<string, number>,
              insights: lines(fd.get("insights")),
              next_steps: lines(fd.get("steps")),
            });
            if (res.error) setError(res.error);
            else setOpen(false);
          })}>
            <h2>עריכת הדוח</h2>
            <span className="txt">את המספרים לוקחים מהתובנות (Insights) של כל פלטפורמה, לכל החודש. שדה ריק לא מוצג בדוח.</span>

            {PLATFORMS.map((p, i) => {
              const row = metrics.find((m) => m.platform === p.k);
              return (
                <details key={p.k} className="acc" open={i === 0 || !!row}>
                  <summary>{p.l}</summary>
                  <div className="accb rfields">
                    {METRIC_FIELDS.map((f) => (
                      <label key={f.k} className="field"><span className="label">{f.l}</span>
                        <input name={`${p.k}-${f.k}`} inputMode="numeric" defaultValue={row?.[f.k] ?? ""} />
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}

            <details className="acc" open>
              <summary>תוצאה עסקית</summary>
              <div className="accb rfields">
                {biz.map((f) => (
                  <label key={f.k} className="field"><span className="label">{f.l}{f.money ? " (₪)" : f.pct ? " (%)" : ""}</span>
                    <input name={`biz-${f.k}`} inputMode="decimal" defaultValue={report?.business?.[f.k] ?? ""} />
                  </label>
                ))}
              </div>
            </details>

            <label className="field"><span className="label">מה למדנו החודש (שורה לכל תובנה, 3–4 משפטים קצרים)</span>
              <textarea name="insights" rows={4} value={insights} onChange={(e) => setInsights(e.target.value)} placeholder="למשל: רילסים עם אנשים קיבלו יותר צפיות מתמונות מוצר" />
            </label>
            {suggestions.insights.length > 0 && (
              <div className="sugg">
                <span className="txt">הצעות מהנתונים:</span>
                {suggestions.insights.map((s) => <button type="button" key={s} className="chipbtn" onClick={() => setInsights((c) => addLine(c, s))}>+ {s}</button>)}
              </div>
            )}

            <label className="field"><span className="label">מה עושים בחודש הבא (שורה לכל פעולה)</span>
              <textarea name="steps" rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="למשל: יותר רילס עם אנשים" />
            </label>
            {suggestions.nextSteps.length > 0 && (
              <div className="sugg">
                <span className="txt">הצעות:</span>
                {suggestions.nextSteps.map((s) => <button type="button" key={s} className="chipbtn" onClick={() => setSteps((c) => addLine(c, s))}>+ {s}</button>)}
              </div>
            )}

            {error && <p className="error">{error}</p>}
            <div className="acts2"><span className="txt">{published ? "הדוח מפורסם – הלקוח יראה את השינויים" : "הלקוח יראה את הדוח רק אחרי פרסום"}</span><button className="pbtn" disabled={pending}>שמירה</button></div>
          </form>
        </Sheet>
      )}
    </>
  );
}
