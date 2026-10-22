"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus, ContentType } from "@/lib/types";

// כל הכתיבות עוברות RLS: רק צוות הלקוח (מנהלת הסטודיו או מנהל/ת הלקוח) יכול לשנות

export type ItemInput = {
  id?: string;
  client_id: string;
  date: string;
  time?: string | null;
  type: ContentType;
  status: ContentStatus;
  title: string;
  caption: string;
  notes: string;
  media: { path: string; thumb: string | null; kind: "image" | "video" }[];
  cover?: { path: string; thumb: string | null } | null; // תמונת קאבר – מוצגת בפיד כתמונה הראשית
  stats?: Record<string, number>;
};

function done(clientId: string) {
  revalidatePath(`/c/${clientId}`, "layout");
  revalidatePath("/");
}

export async function saveItem(input: ItemInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const row = {
    client_id: input.client_id,
    date: input.date,
    ...(input.time !== undefined ? { time: input.time || null } : {}),
    type: input.type,
    status: input.status,
    title: input.title.trim() || "ללא נושא",
    caption: input.caption,
    notes: input.notes,
    media: input.media,
    cover: input.cover ?? null,
    thumb_path: input.cover?.thumb ?? input.cover?.path ?? input.media[0]?.thumb ?? null,
    ...(input.stats ? { stats: input.stats } : {}),
  };
  const { data: auth } = await supabase.auth.getUser();
  // קבצים שהוסרו מהפריט נמחקים מהאחסון
  let removed: string[] = [];
  if (input.id) {
    const { data: prev } = await supabase.from("content_items").select("media, cover").eq("id", input.id).single();
    const keep = new Set([...input.media.flatMap((m) => [m.path, m.thumb]), input.cover?.path, input.cover?.thumb]);
    const before = [...((prev?.media ?? []) as ItemInput["media"]).flatMap((m) => [m.path, m.thumb]), prev?.cover?.path, prev?.cover?.thumb];
    removed = before.filter((p): p is string => !!p && !keep.has(p));
  }
  const { error } = input.id
    ? await supabase.from("content_items").update(row).eq("id", input.id)
    : await supabase.from("content_items").insert({ ...row, created_by: auth.user?.id });
  if (error) return { error: "לא הצלחנו לשמור. ייתכן שאין לך הרשאה ללקוח הזה." };
  if (removed.length) await supabase.storage.from("media").remove(removed);
  done(input.client_id);
  return {};
}

// קישור זמני לקובץ המקורי, להורדה ולהעלאה ידנית לרשתות
export async function mediaUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 600, { download: true });
  return data?.signedUrl ?? null;
}

export async function deleteItem(clientId: string, id: string) {
  const supabase = await createClient();
  const { data: prev } = await supabase.from("content_items").select("media").eq("id", id).single();
  await supabase.from("content_items").delete().eq("id", id);
  const paths = ((prev?.media ?? []) as ItemInput["media"]).flatMap((m) => [m.path, m.thumb]).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from("media").remove(paths);
  done(clientId);
}

export async function addFocus(clientId: string, month: string, text: string, kind: "content" | "marketing" = "content", url = "") {
  if (!text.trim()) return;
  const supabase = await createClient();
  await supabase.from("monthly_focus").insert({ client_id: clientId, month, text: text.trim(), kind, url: url.trim() });
  done(clientId);
}

export async function updateFocus(clientId: string, id: string, patch: { done?: boolean; url?: string; text?: string }) {
  const supabase = await createClient();
  await supabase.from("monthly_focus").update(patch).eq("id", id);
  done(clientId);
}

export async function deleteFocus(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("monthly_focus").delete().eq("id", id);
  done(clientId);
}

export async function addRecurring(clientId: string, title: string) {
  if (!title.trim()) return;
  const supabase = await createClient();
  await supabase.from("recurring_stories").insert({ client_id: clientId, title: title.trim() });
  done(clientId);
}

export async function setRecurringDays(clientId: string, id: string, weekdays: number[]) {
  const supabase = await createClient();
  await supabase.from("recurring_stories").update({ weekdays }).eq("id", id);
  done(clientId);
}

export async function deleteRecurring(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("recurring_stories").delete().eq("id", id);
  done(clientId);
}

export async function addOneOff(clientId: string, date: string, title: string) {
  if (!title.trim()) return;
  const supabase = await createClient();
  await supabase.from("one_off_stories").insert({ client_id: clientId, date, title: title.trim() });
  done(clientId);
}

export async function deleteOneOff(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("one_off_stories").delete().eq("id", id);
  done(clientId);
}

export async function setStoryDoneOn(clientId: string, storyRef: string, date: string, isDone: boolean) {
  const supabase = await createClient();
  if (isDone) await supabase.from("story_checks").upsert({ client_id: clientId, story_ref: storyRef, date });
  else await supabase.from("story_checks").delete().match({ client_id: clientId, story_ref: storyRef, date });
  done(clientId);
}

// קישור זמני לצפייה בתוך האפליקציה (בלי הורדה), למשל לניגון סרטון בפיד
export async function mediaStreamUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function addClientEvent(clientId: string, date: string, title: string) {
  if (!title.trim()) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("client_events").insert({ client_id: clientId, date, title: title.trim(), created_by: auth.user?.id });
  done(clientId);
}

export async function deleteClientEvent(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("client_events").delete().eq("id", id);
  done(clientId);
}

// סידור הפיד בגרירה: התאריכים עוברים לפי הסדר החדש, והגאנט מתעדכן בהתאם
export async function reorderDates(clientId: string, updates: { id: string; date: string }[]) {
  const supabase = await createClient();
  await Promise.all(updates.map((u) => supabase.from("content_items").update({ date: u.date }).eq("id", u.id)));
  done(clientId);
}

// סטורי חד-פעמי עם קבצים (ממסך הסטוריז)
export async function saveOneOffStory(clientId: string, input: { id?: string; date: string; title: string; media: { path: string; thumb: string | null; kind: string }[] }) {
  if (!input.title.trim()) return;
  const supabase = await createClient();
  const row = { client_id: clientId, date: input.date, title: input.title.trim(), media: input.media };
  if (input.id) await supabase.from("one_off_stories").update(row).eq("id", input.id);
  else await supabase.from("one_off_stories").insert(row);
  done(clientId);
}
