"use client";

import { useState } from "react";
import { MONTHS } from "@/lib/dates";

const nf = new Intl.NumberFormat("he-IL");
export const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)}׳ ${m.slice(2, 4)}`;

// גרף קו פשוט: סדרה אחת, קו 2px, נקודה אחרונה מודגשת, ערך בריחוף/פוקוס, רשת עדינה
export function LineChart({ rows, label }: { rows: { month: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 110, P = { t: 14, r: 14, b: 22, l: 14 };
  const vals = rows.map((r) => r.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(rows.length - 1, 1);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const d = rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.value)}`).join(" ");
  const shown = hover ?? rows.length - 1;
  return (
    <svg className="lchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ direction: "ltr" }}>
      {[0, 0.5, 1].map((f) => <line key={f} x1={P.l} x2={W - P.r} y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)} className="grid" />)}
      <path d={d} className="line" />
      {rows.map((r, i) => (
        <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
          <rect x={x(i) - 16} y={0} width={32} height={H} fill="transparent" />
          <circle cx={x(i)} cy={y(r.value)} r={i === shown ? 4.5 : 3} className="pt" />
          <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{monthShort(r.month)}</text>
        </g>
      ))}
      <text x={Math.min(Math.max(x(shown), 40), W - 40)} y={Math.max(y(rows[shown].value) - 9, 10)} textAnchor="middle" className="tip">{nf.format(rows[shown].value)}</text>
    </svg>
  );
}
