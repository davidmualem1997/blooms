"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { todayIL } from "@/lib/dates";
import { extractPlanFromPdf, type Plan } from "@/lib/plan-extract";
import { createClient } from "@/lib/supabase/server";

export type PlanRow = { key: string; dup: boolean };
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// PDF של תכנון → הצעה לגאנט, עם סימון של מה שכבר קיים. הקובץ נמחק אחרי הקריאה
export async function readPlanPdf(clientId: string, path: string): Promise<{ plan?: Plan; dups?: string[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.role === "client" || !ctx.clients.some((c) => c.id === clientId)) return { error: "אין הרשאה" };
  const supabase = await createClient();
  if (path.split("/")[1] !== clientId || !path.toLowerCase().endsWith(".pdf")) return { error: "קובץ לא תקין" };
  const { data: file, error } = await supabase.storage.from("media").download(path);
  if (error || !file) return { error: "לא הצלחנו לקרוא את הקובץ" };
  try {
    if (file.size > 25 * 1024 * 1024) return { error: "הקובץ גדול מדי (עד 25MB)" };
    const plan = await extractPlanFromPdf(Buffer.from(await file.arrayBuffer()), "plan.pdf", todayIL());
    const dates = [...plan.posts, ...plan.stories, ...plan.events].map((x) => x.date).concat(plan.highlights.map((h) => `${h.month}-01`)).sort();
    const dups: string[] = [];
    if (dates.length) {
      const [from, to] = [dates[0].slice(0, 7) + "-01", dates[dates.length - 1]];
      const [items, stories, events, focus] = await Promise.all([
        supabase.from("content_items").select("date, title").eq("client_id", clientId).gte("date", from).lte("date", to),
        supabase.from("one_off_stories").select("date, title").eq("client_id", clientId).gte("date", from).lte("date", to),
        supabase.from("client_events").select("date, title").eq("client_id", clientId).gte("date", from).lte("date", to),
        supabase.from("monthly_focus").select("month, text").eq("client_id", clientId).gte("month", from).lte("month", to),
      ]);
      const has = (rows: { date: string; title: string }[] | null, d: string, t: string) => (rows ?? []).some((r) => r.date === d && norm(r.title) === norm(t));
      plan.posts.forEach((x, i) => has(items.data, x.date, x.title) && dups.push(`p${i}`));
      plan.stories.forEach((x, i) => has(stories.data, x.date, x.title) && dups.push(`s${i}`));
      plan.events.forEach((x, i) => has(events.data, x.date, x.title) && dups.push(`e${i}`));
      plan.highlights.forEach((x, i) => (focus.data ?? []).some((r) => r.month.slice(0, 7) === x.month && norm(r.text) === norm(x.text)) && dups.push(`h${i}`));
    }
    return { plan, dups };
  } catch (e) {
    console.error("plan extract", (e as Error).message);
    return { error: "לא הצלחנו לקרוא את התכנון מהקובץ. נסו שוב או קובץ אחר." };
  } finally {
    await supabase.storage.from("media").remove([path, path.replace(/original\.pdf$/i, "thumb.jpg")]);
  }
}

// הכנסה לגאנט של מה שסומן. פוסטים נכנסים בסטטוס "בעבודה"
export async function importPlan(clientId: string, plan: Plan): Promise<{ error?: string; count?: number }> {
  const ctx = await getContext();
  if (ctx.role === "client" || !ctx.clients.some((c) => c.id === clientId)) return { error: "אין הרשאה" };
  const supabase = await createClient();
  const by = ctx.userId;
  const results = await Promise.all([
    plan.posts.length ? supabase.from("content_items").insert(plan.posts.map((x) => ({
      client_id: clientId, date: x.date, time: x.time || null, type: x.type, status: "work", title: x.title || "ללא נושא",
      caption: x.caption, notes: x.notes, media: [], created_by: by,
    }))) : null,
    plan.stories.length ? supabase.from("one_off_stories").insert(plan.stories.map((x) => ({ client_id: clientId, date: x.date, title: x.title }))) : null,
    plan.events.length ? supabase.from("client_events").insert(plan.events.map((x) => ({ client_id: clientId, date: x.date, title: x.title, created_by: by }))) : null,
    plan.highlights.length ? supabase.from("monthly_focus").insert(plan.highlights.map((x, i) => ({ client_id: clientId, month: `${x.month}-01`, text: x.text, kind: "content", url: "", position: 100 + i }))) : null,
  ]);
  const failed = results.find((r) => r?.error);
  if (failed) { console.error("plan import", failed.error?.message); return { error: "חלק מהפריטים לא נשמרו. נסו שוב." }; }
  revalidatePath(`/c/${clientId}`, "layout");
  revalidatePath("/");
  return { count: plan.posts.length + plan.stories.length + plan.events.length + plan.highlights.length };
}
