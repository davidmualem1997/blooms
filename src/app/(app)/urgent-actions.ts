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

export async function markUrgentDone(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("urgent_notes").update({ done_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/c/${clientId}`);
}
