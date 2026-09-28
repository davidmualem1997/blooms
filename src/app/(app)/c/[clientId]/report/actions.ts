"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MetricInput = { platform: "instagram" | "facebook" | "tiktok"; followers: number | null; reach: number | null; interactions: number | null };

// נתוני החודש מוזנים ידנית (עד שיהיה חיבור ל-API של מטא וטיקטוק)
export async function saveMetrics(clientId: string, month: string, rows: MetricInput[]) {
  const supabase = await createClient();
  const data = rows
    .filter((r) => r.followers != null || r.reach != null || r.interactions != null)
    .map((r) => ({ client_id: clientId, month, ...r }));
  if (data.length) await supabase.from("metrics").upsert(data, { onConflict: "client_id,platform,month" });
  revalidatePath(`/c/${clientId}`, "layout");
}
