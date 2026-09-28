import { createClient } from "@/lib/supabase/server";
import { deadlines, weekday } from "@/lib/dates";
import type { Client, ContentItem, Message, OneOffStory, RecurringStory } from "@/lib/types";

export type TodoRow =
  | { kind: "item"; item: ContentItem; done: boolean }
  | { kind: "story"; ref: string; title: string; done: boolean };

export type ClientToday = { client: Client; rows: TodoRow[] };

// כל מה שדף הבית צריך עבור קבוצת לקוחות, בכמה שאילתות מקבילות
export async function loadToday(clients: Client[], today: string) {
  const ids = clients.map((c) => c.id);
  if (ids.length === 0) return { perClient: [], messages: [], review: [], planned: [], overdue: [] };
  const supabase = await createClient();
  const dl = deadlines(today);

  const [items, recurring, oneOff, checks, messages, review, planned, overdue] = await Promise.all([
    supabase.from("content_items").select("*").in("client_id", ids).eq("date", today).order("created_at"),
    supabase.from("recurring_stories").select("*").in("client_id", ids).order("position"),
    supabase.from("one_off_stories").select("*").in("client_id", ids).eq("date", today),
    supabase.from("story_checks").select("client_id, story_ref").in("client_id", ids).eq("date", today),
    supabase.from("messages").select("*").in("client_id", ids).is("resolved_at", null).order("created_at"),
    supabase.from("content_items").select("*").in("client_id", ids).eq("status", "review").order("date"),
    // פריטים של החודשים שעליהם מדברים המונים, לחישוב "הוגשו" ו"אושרו"
    supabase.from("content_items").select("client_id, date, status").in("client_id", ids).gte("date", dl.approve.month), // חודש האישור תמיד קודם או שווה לחודש ההגשה
    supabase.from("content_items").select("*").in("client_id", ids).lt("date", today).neq("status", "live").gte("date", shift(today, -7)).order("date"),
  ]);

  const done = new Set((checks.data ?? []).map((c) => `${c.client_id}|${c.story_ref}`));
  const wd = weekday(today);

  const perClient: ClientToday[] = clients.map((client) => {
    const rows: TodoRow[] = [];
    for (const item of (items.data ?? []) as ContentItem[]) {
      if (item.client_id === client.id) rows.push({ kind: "item", item, done: item.status === "live" });
    }
    for (const s of (recurring.data ?? []) as RecurringStory[]) {
      if (s.client_id === client.id && s.weekdays.includes(wd)) {
        const ref = `r:${s.id}`;
        rows.push({ kind: "story", ref, title: s.title, done: done.has(`${client.id}|${ref}`) });
      }
    }
    for (const s of (oneOff.data ?? []) as OneOffStory[]) {
      if (s.client_id === client.id) {
        const ref = `o:${s.id}`;
        rows.push({ kind: "story", ref, title: s.title, done: done.has(`${client.id}|${ref}`) });
      }
    }
    return { client, rows };
  });

  return {
    perClient,
    messages: (messages.data ?? []) as Message[],
    review: (review.data ?? []) as ContentItem[],
    planned: (planned.data ?? []) as Pick<ContentItem, "client_id" | "date" | "status">[],
    overdue: (overdue.data ?? []) as ContentItem[],
  };
}

function shift(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// לקוח "הגיש" אם לכל הפריטים בחודש כבר אין סטטוס בעבודה/לבדיקה; "אישר" אם כולם מאושרים או עלו
export function planProgress(clientIds: string[], planned: { client_id: string; date: string; status: string }[], month: string) {
  const inMonth = (p: { date: string }) => p.date.slice(0, 7) === month.slice(0, 7);
  let submitted = 0;
  let approved = 0;
  for (const id of clientIds) {
    const its = planned.filter((p) => p.client_id === id && inMonth(p));
    if (its.length && its.every((i) => i.status !== "work" && i.status !== "review")) submitted++;
    if (its.length && its.every((i) => i.status === "ok" || i.status === "live")) approved++;
  }
  return { submitted, approved };
}
