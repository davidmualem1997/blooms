"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ביקור בפיד מאפס את הנקודה על הפעמון
export async function markActivitySeen() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("profiles").update({ activity_seen_at: new Date().toISOString() }).eq("id", data.user.id);
  revalidatePath("/", "layout");
}
