"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayIL } from "@/lib/dates";

// ההרשאות נאכפות ב-RLS; פעולה של מי שאינו מורשה פשוט לא תשפיע על אף שורה

export async function setItemLive(itemId: string, live: boolean) {
  const supabase = await createClient();
  await supabase
    .from("content_items")
    .update({ status: live ? "live" : "ok", published_at: live ? new Date().toISOString() : null })
    .eq("id", itemId);
  revalidatePath("/", "layout");
}

export async function setStoryDone(clientId: string, storyRef: string, done: boolean) {
  const supabase = await createClient();
  const date = todayIL();
  if (done) {
    await supabase.from("story_checks").upsert({ client_id: clientId, story_ref: storyRef, date });
  } else {
    await supabase.from("story_checks").delete().match({ client_id: clientId, story_ref: storyRef, date });
  }
  revalidatePath("/", "layout");
}

export async function resolveMessage(messageId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  await supabase.from("messages").update({ status: "done", resolved_by: data.user?.id }).eq("id", messageId);
  revalidatePath("/", "layout");
}
