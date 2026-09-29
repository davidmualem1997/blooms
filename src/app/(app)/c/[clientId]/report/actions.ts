"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { METRIC_FIELDS, type MetricKey, type Platform } from "@/lib/report-calc";

export type ReportInput = {
  metrics: ({ platform: Platform } & Partial<Record<MetricKey, number | null>>)[];
  business: Record<string, number>;
  insights: string[];
  next_steps: string[];
};

// הדוח החודשי: נתוני הפלטפורמות, תוצאה עסקית, תובנות ומה עושים בחודש הבא (צוות בלבד – נאכף ב-RLS)
export async function saveReport(clientId: string, month: string, input: ReportInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  const keys = METRIC_FIELDS.map((f) => f.k);
  const rows = input.metrics
    .filter((r) => keys.some((k) => r[k] != null))
    .map((r) => ({ client_id: clientId, month, platform: r.platform, ...Object.fromEntries(keys.map((k) => [k, r[k] ?? null])) }));
  if (rows.length) {
    const { error } = await supabase.from("metrics").upsert(rows, { onConflict: "client_id,platform,month" });
    if (error) return { error: "לא הצלחנו לשמור את הנתונים" };
  }
  const { error } = await supabase.from("monthly_reports").upsert({
    client_id: clientId, month, business: input.business,
    insights: input.insights.map((s) => s.trim()).filter(Boolean),
    next_steps: input.next_steps.map((s) => s.trim()).filter(Boolean),
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id,month" });
  if (error) return { error: "לא הצלחנו לשמור את הדוח" };
  revalidatePath(`/c/${clientId}`, "layout");
  return {};
}

// פרסום ללקוח: מרגע זה הלקוח רואה את הדוח
export async function setReportPublished(clientId: string, month: string, published: boolean) {
  const supabase = await createClient();
  await supabase.from("monthly_reports").upsert({ client_id: clientId, month, published_at: published ? new Date().toISOString() : null }, { onConflict: "client_id,month" });
  revalidatePath(`/c/${clientId}`, "layout");
}
