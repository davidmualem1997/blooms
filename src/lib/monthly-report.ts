import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/media-server";
import { israelToUTC, monthRange } from "@/lib/dates";
import { guessIndustry, type Industry } from "@/lib/holidays";
import { computeReport, type Metric, type Post } from "@/lib/report-calc";
import type { Brand, Client } from "@/lib/types";

export type ReportRow = { business: Record<string, number>; insights: string[]; next_steps: string[]; published_at: string | null };

const shiftMonth = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };

export async function loadMonthlyReport(client: Client, month: string) {
  const supabase = await createClient();
  const [from, to] = monthRange(month);
  const prevMonth = shiftMonth(month, -1);
  const [{ data: metrics }, { data: items }, { data: reports }, { data: clicks }] = await Promise.all([
    supabase.from("metrics").select("*").eq("client_id", client.id).gte("month", shiftMonth(month, -6)).lte("month", month).order("month"),
    supabase.from("content_items").select("id, title, type, date, time, stats, thumb_path").eq("client_id", client.id).eq("status", "live").gte("date", from).lte("date", to).order("date"),
    supabase.from("monthly_reports").select("month, business, insights, next_steps, published_at").eq("client_id", client.id).in("month", [month, prevMonth]),
    // לחיצות על קישורי BLOOMS בחודש – נספרות אוטומטית לפי סוג הקישור
    supabase.from("link_clicks").select("links(kind)").eq("client_id", client.id)
      .gte("clicked_at", israelToUTC(from, "00:00")).lt("clicked_at", israelToUTC(shiftMonth(month, 1), "00:00")),
  ]);
  const linkClicks: Record<string, number> = {};
  for (const c of (clicks ?? []) as unknown as { links: { kind: string } | null }[]) if (c.links) linkClicks[c.links.kind] = (linkClicks[c.links.kind] ?? 0) + 1;
  const thumbs = await signPaths((items ?? []).map((i) => i.thumb_path));
  const posts: Post[] = (items ?? []).map((i) => ({ id: i.id, title: i.title, type: i.type, date: i.date, time: i.time, stats: i.stats ?? {}, thumb: i.thumb_path ? thumbs[i.thumb_path] ?? null : null }));
  const report = (reports ?? []).find((r) => r.month === month) as ReportRow | undefined;
  const prev = (reports ?? []).find((r) => r.month === prevMonth) as ReportRow | undefined;
  const brand = (client.brand ?? {}) as Brand;
  const industry = (brand.industry as Industry) || guessIndustry([client.name, brand.story, brand.audience].join(" "));

  const calc = computeReport({ month, metrics: (metrics ?? []) as Metric[], posts, business: report?.business ?? {}, prevBusiness: prev?.business ?? {}, industry });
  return { linkClicks, month, prevMonth, nextMonth: shiftMonth(month, 1), industry, posts, report: report ?? null, metrics: ((metrics ?? []) as Metric[]).filter((m) => m.month === month), ...calc };
}
