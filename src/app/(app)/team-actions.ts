"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { israelToUTC } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklyTrends, trendsConfigured } from "@/lib/trends";

// פגישות צוות: מנהלת הסטודיו קובעת ומסכמת; המשתתפים מוסיפים ומסמנים נושאים (נאכף ב-RLS ובטריגר)

type Topic = { text: string; done: boolean };

export async function scheduleTeamMeeting(input: { date: string; time: string; kind: "meet" | "call" | "zoom"; location: string; attendees: string[]; topics: string[] }) {
  const ctx = await getContext();
  if (ctx.role !== "owner" || !ctx.studioId) return;
  const supabase = await createClient();
  await supabase.from("team_meetings").insert({
    studio_id: ctx.studioId, starts_at: israelToUTC(input.date, input.time), kind: input.kind, location: input.location,
    attendee_ids: input.attendees, topics: input.topics.filter(Boolean).map((text) => ({ text, done: false })), created_by: ctx.userId,
  });
  revalidatePath("/");
}

async function editTopics(id: string, fn: (t: Topic[]) => Topic[]) {
  const supabase = await createClient();
  const { data } = await supabase.from("team_meetings").select("topics").eq("id", id).single();
  await supabase.from("team_meetings").update({ topics: fn((data?.topics ?? []) as Topic[]) }).eq("id", id);
  revalidatePath("/");
}

export async function addTeamTopic(id: string, text: string) {
  if (text.trim()) await editTopics(id, (t) => [...t, { text: text.trim(), done: false }]);
}
export async function toggleTeamTopic(id: string, index: number) {
  await editTopics(id, (t) => t.map((x, i) => (i === index ? { ...x, done: !x.done } : x)));
}
export async function removeTeamTopic(id: string, index: number) {
  await editTopics(id, (t) => t.filter((_, i) => i !== index));
}

export async function saveTeamSummary(id: string, summary: string) {
  const supabase = await createClient();
  await supabase.from("team_meetings").update({ summary }).eq("id", id);
  revalidatePath("/");
}

export async function deleteTeamMeeting(id: string) {
  const supabase = await createClient();
  await supabase.from("team_meetings").delete().eq("id", id);
  revalidatePath("/");
}

// רענון ידני של הטרנדים (בנוסף ל-cron של יום ראשון)
export async function refreshTrends(): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.role !== "owner") return { error: "רק מנהלת הסטודיו יכולה לרענן" };
  if (!trendsConfigured() || !process.env.SUPABASE_SECRET_KEY) {
    return { error: "חסרים מפתחות: OPENAI_API_KEY ו-SUPABASE_SECRET_KEY" };
  }
  try {
    await generateWeeklyTrends();
    revalidatePath("/");
    return {};
  } catch {
    return { error: "המחקר נכשל. נסו שוב בעוד כמה דקות." };
  }
}
