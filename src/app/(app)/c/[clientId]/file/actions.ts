"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { israelToUTC } from "@/lib/dates";
import { notifyLater } from "@/lib/push";
import type { Brand } from "@/lib/types";

// תיק הלקוח: צוות ומשתמשי הלקוח יכולים לערוך (RLS + טריגר guard_client_update);
// משימות צוות – צוות בלבד; פגישות – כולם קובעים, רק הצוות מסכם ומוחק

function done(clientId: string) {
  revalidatePath(`/c/${clientId}`, "layout");
}

export async function updateBrand(clientId: string, patch: Partial<Brand>) {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("brand").eq("id", clientId).single();
  const brand = { ...((data?.brand as Brand) ?? {}), ...patch };
  await supabase.from("clients").update({ brand }).eq("id", clientId);
  done(clientId);
}

export async function addTask(clientId: string, title: string, assigneeId: string) {
  if (!title.trim()) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("tasks").insert({ client_id: clientId, title: title.trim(), assignee_id: assigneeId, created_by: auth.user?.id });
  done(clientId);
  revalidatePath("/");
}

export async function updateTask(clientId: string, id: string, patch: { done?: boolean; assignee_id?: string; title?: string; description?: string; urgent?: boolean }) {
  const supabase = await createClient();
  await supabase.from("tasks").update(patch).eq("id", id);
  done(clientId);
  revalidatePath("/");
}

export async function deleteTask(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);
  done(clientId);
}

// סיכום לפגישה שלא נקבעה מראש (שיחה קצרה, פגישה ספונטנית): יוצרים את הפגישה ושומרים את הסיכום
export async function addMeetingSummary(clientId: string, kind: "meet" | "call" | "zoom", date: string, summary: string) {
  if (!summary.trim()) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: m } = await supabase.from("meetings").insert({ client_id: clientId, kind, starts_at: israelToUTC(date, "12:00"), location: "", created_by: auth.user?.id }).select("id").single();
  if (m) await saveSummary(clientId, m.id, summary.trim(), []);
  done(clientId);
}

export async function addMeeting(clientId: string, kind: "meet" | "call" | "zoom", date: string, time: string, location: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("meetings").insert({ client_id: clientId, kind, starts_at: israelToUTC(date, time), location, created_by: auth.user?.id });
  done(clientId);
}

export async function deleteMeeting(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("meetings").delete().eq("id", id);
  done(clientId);
}

export async function setMeetingTopics(clientId: string, id: string, topics: string[]) {
  const supabase = await createClient();
  await supabase.from("meetings").update({ extra_topics: topics }).eq("id", id);
  done(clientId);
}

export async function saveSummary(clientId: string, id: string, summary: string, resolveMessageIds: string[]) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: meeting } = await supabase.from("meetings").update({ summary }).eq("id", id).select("starts_at").single();
  if (summary.trim() && meeting) {
    const day = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" }).format(new Date(meeting.starts_at));
    notifyLater({ clientId, who: "client" }, { body: `סיכום הפגישה מ־${day} זמין עכשיו`, url: `/c/${clientId}/file`, tag: `summary-${id}` }, auth.user?.id, `summary:${id}`);
  }
  if (resolveMessageIds.length) {
    await supabase.from("messages").update({ status: "done", resolved_by: auth.user?.id }).in("id", resolveMessageIds);
  }
  done(clientId);
  revalidatePath("/");
}

// אירועים קרובים עם תמונות לפרסום (נשמרים באותה טבלה של האירועים בלוח השנה)
export async function saveEvent(clientId: string, input: { id?: string; date: string; title: string; description: string; link: string; needs_material?: boolean; images: { path: string; thumb: string | null }[] }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const row = { client_id: clientId, date: input.date, title: input.title.trim() || "אירוע", description: input.description, link: input.link, images: input.images, needs_material: !!input.needs_material };
  if (input.id) await supabase.from("client_events").update(row).eq("id", input.id);
  else await supabase.from("client_events").insert({ ...row, created_by: auth.user?.id });
  done(clientId);
  revalidatePath("/");
}

export async function deleteEvent(clientId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("client_events").select("images").eq("id", id).single();
  await supabase.from("client_events").delete().eq("id", id);
  const paths = ((data?.images ?? []) as { path: string; thumb: string | null }[]).flatMap((i) => [i.path, i.thumb]).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from("media").remove(paths);
  done(clientId);
  revalidatePath("/");
}
