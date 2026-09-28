import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/media-server";
import { parseISODate, toISODate } from "@/lib/dates";
import type { ContentItem } from "@/lib/types";

export type MetricRow = { platform: "instagram" | "facebook" | "tiktok"; month: string; followers: number | null; reach: number | null; interactions: number | null };
export type BestPost = { id: string; title: string; type: ContentItem["type"]; date: string; score: number; thumb: string | null };

const score = (s: Record<string, number | undefined>) => s.views ?? s.reach ?? (s.likes ?? 0) + (s.comments ?? 0) + (s.saves ?? 0);

export async function loadReport(clientId: string, today: string) {
  const supabase = await createClient();
  const half = parseISODate(today);
  half.setUTCMonth(half.getUTCMonth() - 6);
  const month = parseISODate(today);
  month.setUTCDate(month.getUTCDate() - 30);
  const [{ data: metrics }, { data: posts }] = await Promise.all([
    supabase.from("metrics").select("platform, month, followers, reach, interactions").eq("client_id", clientId).order("month"),
    supabase.from("content_items").select("id, title, type, date, stats, thumb_path").eq("client_id", clientId).eq("status", "live").gte("date", toISODate(half)),
  ]);
  const scored = ((posts ?? []) as (Pick<ContentItem, "id" | "title" | "type" | "date" | "thumb_path"> & { stats: Record<string, number> })[])
    .map((p) => ({ ...p, score: score(p.stats ?? {}) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  const thumbs = await signPaths(scored.slice(0, 6).map((p) => p.thumb_path));
  const toBest = (list: typeof scored): BestPost[] => list.slice(0, 3).map((p) => ({ id: p.id, title: p.title, type: p.type, date: p.date, score: p.score, thumb: p.thumb_path ? thumbs[p.thumb_path] ?? null : null }));
  return {
    metrics: (metrics ?? []) as MetricRow[],
    bestMonth: toBest(scored.filter((p) => p.date >= toISODate(month))),
    bestHalf: toBest(scored),
  };
}
