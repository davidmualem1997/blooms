"use server";

import { revalidatePath } from "next/cache";
import { notifyLater } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type UrgentTo = "owner" | "manager" | "client";
const TO_AUDIENCE = { owner: "owners", manager: "manager", client: "client" } as const;

// הודעה דחופה בתוך לקוח: נשמרת ומגיעה מיד כהתראה לנמען
export async function sendUrgent(clientId: string, to: UrgentTo, body: string): Promise<{ error?: string }> {
  const text = body.trim();
  if (!text) return {};
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("urgent_notes").insert({ client_id: clientId, to_role: to, body: text.slice(0, 1000), from_user: auth.user?.id });
  if (error) return { error: "לא הצלחנו לשלוח" };
  notifyLater({ clientId, who: TO_AUDIENCE[to] }, { body: `הודעה דחופה: ${text.slice(0, 120)}`, url: `/c/${clientId}`, tag: `urgent-${clientId}` }, auth.user?.id);
  revalidatePath(`/c/${clientId}`);
  return {};
}

// תשובה בשיחה: נשמרת ומגיעה כהתראה לצד השני (מי ששלח את ההודעה + הנמענים)
export async function replyUrgent(clientId: string, id: string, body: string): Promise<{ error?: string }> {
  const text = body.trim();
  if (!text) return {};
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: note } = await supabase.from("urgent_notes").select("replies, from_user, to_role").eq("id", id).single();
  if (!note) return { error: "השיחה לא נמצאה" };
  const replies = [...((note.replies ?? []) as unknown[]), { author_id: auth.user?.id, text: text.slice(0, 1000), at: new Date().toISOString() }];
  const { error } = await supabase.from("urgent_notes").update({ replies, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "לא הצלחנו לשלוח" };
  const payload = { body: `תשובה בהודעה דחופה: ${text.slice(0, 120)}`, url: `/c/${clientId}`, tag: `urgent-${id}` };
  if (note.from_user) notifyLater({ userIds: [note.from_user], clientId }, payload, auth.user?.id);
  notifyLater({ clientId, who: TO_AUDIENCE[note.to_role as UrgentTo] }, payload, auth.user?.id);
  revalidatePath(`/c/${clientId}`);
  return {};
}

// סגירת השיחה
export async function markUrgentDone(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("urgent_notes").update({ done_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/c/${clientId}`);
}
