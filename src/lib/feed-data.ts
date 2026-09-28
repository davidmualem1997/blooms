import { getContext } from "@/lib/context";
import { todayIL } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types";

// נתונים משותפים לפיד אינסטגרם ולפיד טיקטוק
export async function loadFeed(clientId: string, tiktok: boolean) {
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId)!;
  const supabase = await createClient();
  let q = supabase.from("content_items").select("*").eq("client_id", clientId);
  q = tiktok ? q.eq("type", "tiktok") : q.neq("type", "tiktok");
  const { data } = await q.order("date", { ascending: tiktok });
  const items = (data ?? []) as ContentItem[];
  const thumbs = await signPaths(items.map((i) => i.thumb_path));
  const today = todayIL();
  const dates = items.map((i) => i.date).sort();
  return { ctx, client, items, thumbs, today, lastDate: dates[dates.length - 1] ?? null, canEdit: ctx.role !== "client" };
}
