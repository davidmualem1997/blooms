"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

export async function updateProfile(patch: { full_name?: string; avatar_path?: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("profiles").update(patch).eq("id", data.user.id);
  revalidatePath("/", "layout");
}

// ---- התראות Push: כל מכשיר נרשם בנפרד
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function subscribePush(sub: Sub): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "invalid" };
  // אותו מכשיר שהיה רשום למשתמש אחר (התנתקות והתחברות בחשבון אחר) עובר למשתמש הנוכחי
  if (process.env.SUPABASE_SECRET_KEY) await createAdminClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint).neq("user_id", data.user.id);
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: data.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: "endpoint" },
  );
  return error ? { error: error.message } : {};
}

export async function unsubscribePush(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function testPush(): Promise<{ sent: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { sent: 0 };
  const sent = await sendPush([data.user.id], { title: "BLOOMS", body: "ההתראות עובדות 🌸", url: "/me", tag: "test" });
  return { sent };
}

// ---- אפליקציית האייפון: token להתראות של אפל
export async function saveNativeToken(token: string, platform: "ios" | "android" = "ios"): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !/^[0-9a-f]{32,200}$/i.test(token)) return { error: "invalid" };
  // אותו מכשיר שהיה רשום למשתמש אחר (התנתקות והתחברות בחשבון אחר) עובר למשתמש הנוכחי
  if (process.env.SUPABASE_SECRET_KEY) await createAdminClient().from("native_push_tokens").delete().eq("token", token).neq("user_id", data.user.id);
  const { error } = await supabase.from("native_push_tokens").upsert({ user_id: data.user.id, token, platform, updated_at: new Date().toISOString() }, { onConflict: "token" });
  return error ? { error: error.message } : {};
}

export async function removeNativeToken(token: string) {
  const supabase = await createClient();
  await supabase.from("native_push_tokens").delete().eq("token", token);
}
