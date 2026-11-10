"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// חיבור לבוט הוואטסאפ: קוד חד-פעמי ל-15 דקות, ששולחים לבוט מהטלפון
export async function createWhatsAppCode(): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "צריך להתחבר" };
  const admin = createAdminClient();
  await admin.from("whatsapp_link_codes").delete().eq("user_id", data.user.id);
  const code = String(randomInt(100000, 1000000));
  const { error } = await admin.from("whatsapp_link_codes").insert({ code, user_id: data.user.id, expires_at: new Date(Date.now() + 15 * 60e3).toISOString() });
  if (error) return { error: "לא הצלחנו ליצור קוד. נסו שוב." };
  return { code };
}

export async function disconnectWhatsApp() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("whatsapp_links").delete().eq("user_id", data.user.id);
  revalidatePath("/me");
}
