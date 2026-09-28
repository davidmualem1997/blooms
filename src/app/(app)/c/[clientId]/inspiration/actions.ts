"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { previewImageFor } from "@/lib/link-preview";

// רעיונות, הודעות ואישורים. לקוח יכול להוסיף רק רעיון מסוג "רעיון לקוח" (נאכף ב-RLS)

function done(clientId: string) {
  revalidatePath(`/c/${clientId}`, "layout");
  revalidatePath("/");
}

export type IdeaInput = { title: string; note: string; url: string; image_path: string | null };

export async function addIdea(clientId: string, month: string, input: IdeaInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: isClient } = await supabase.rpc("is_client_user", { cid: clientId });
  const { data: client } = await supabase.from("clients").select("studio_id").eq("id", clientId).single();
  const image_path = input.url && client ? await previewImageFor(input.url, client.studio_id, clientId) : null;
  const { error } = await supabase.from("ideas").insert({
    client_id: clientId, month, ...input, image_path, title: input.title.trim() || "רעיון",
    source: isClient ? "client" : "team", created_by: auth.user?.id,
  });
  if (error) return { error: "לא הצלחנו לשמור את הרעיון" };
  done(clientId);
  return {};
}

export async function updateIdea(clientId: string, id: string, input: Partial<IdeaInput> & { used?: boolean }) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { ...input };
  delete patch.image_path;
  if (input.url !== undefined) {
    // הקישור השתנה – מחליפים גם את התמונה הראשית
    const { data: prev } = await supabase.from("ideas").select("url, image_path, studio_id").eq("id", id).single();
    if (prev && prev.url !== input.url) {
      patch.image_path = input.url ? await previewImageFor(input.url, prev.studio_id, clientId) : null;
      if (prev.image_path) await supabase.storage.from("media").remove([prev.image_path]);
    }
  }
  await supabase.from("ideas").update(patch).eq("id", id);
  done(clientId);
}

export async function deleteIdea(clientId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("ideas").select("image_path").eq("id", id).single();
  await supabase.from("ideas").delete().eq("id", id);
  if (data?.image_path) await supabase.storage.from("media").remove([data.image_path]);
  done(clientId);
}

export async function sendMessage(clientId: string, kind: "request" | "fix" | "call", body: string): Promise<{ error?: string }> {
  if (!body.trim()) return {};
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("messages").insert({ client_id: clientId, kind, body: body.trim(), created_by: auth.user?.id });
  if (error) return { error: "ההודעה לא נשלחה. נסו שוב." };
  done(clientId);
  return {};
}

export async function reviewItem(clientId: string, itemId: string, approve: boolean, note = "") {
  const supabase = await createClient();
  await supabase.rpc("review_item", { item_id: itemId, approve, note });
  done(clientId);
}
