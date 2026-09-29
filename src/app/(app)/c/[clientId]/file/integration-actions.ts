"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { decryptSecret } from "@/lib/integrations/crypto";
import { sealMeta, syncMeta, type MetaAccount } from "@/lib/integrations/meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// מי שרואה את הלקוח (צוות או הלקוח עצמו) יכול לחבר ולנתק – כך כל לקוח יוכל בעתיד לחבר לבד
async function allowed(clientId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  return auth.user && client ? auth.user.id : null;
}

export async function loadPendingMeta(clientId: string, pendingId: string) {
  const userId = await allowed(clientId);
  if (!userId) return null;
  const { data } = await createAdminClient().from("integration_pending").select("ciphertext").eq("id", pendingId).eq("user_id", userId).eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  // רק מה שצריך לתצוגה – בלי ההרשאות
  return decryptSecret<MetaAccount[]>(data.ciphertext).map(({ pageId, pageName, igUsername, picture, igId }) => ({ pageId, pageName, igUsername, picture, hasIg: !!igId }));
}

export async function connectMetaAccount(clientId: string, pendingId: string, pageId: string): Promise<{ error?: string }> {
  const userId = await allowed(clientId);
  if (!userId) return { error: "אין הרשאה" };
  const admin = createAdminClient();
  const { data: pending } = await admin.from("integration_pending").select("ciphertext").eq("id", pendingId).eq("user_id", userId).eq("client_id", clientId).maybeSingle();
  if (!pending) return { error: "פג תוקף הבחירה – התחברו שוב" };
  const acc = decryptSecret<MetaAccount[]>(pending.ciphertext).find((a) => a.pageId === pageId);
  if (!acc) return { error: "החשבון לא נמצא" };

  // לקוח אחד = חשבון Meta אחד: מחליפים חיבור קודם אם היה
  await admin.from("integrations").delete().eq("client_id", clientId).eq("provider", "meta");
  const { data: integration, error } = await admin.from("integrations").insert({
    client_id: clientId, provider: "meta", external_id: acc.igId ?? acc.pageId,
    external_name: acc.igUsername ? `@${acc.igUsername}` : acc.pageName, created_by: userId,
  }).select("id, client_id").single();
  if (error || !integration) return { error: "לא הצלחנו לשמור את החיבור" };
  await admin.from("integration_secrets").insert({ integration_id: integration.id, ciphertext: sealMeta({ pageId: acc.pageId, pageToken: acc.pageToken, igId: acc.igId }) });
  await admin.from("integration_pending").delete().eq("id", pendingId);

  // סנכרון ראשון מיד (אחרי שהמסך חוזר)
  after(async () => {
    try { await syncMeta(admin, integration); }
    catch (e) { await admin.from("integrations").update({ status: "error", last_error: (e as Error).message }).eq("id", integration.id); }
    revalidatePath(`/c/${clientId}`, "layout");
  });
  revalidatePath(`/c/${clientId}`, "layout");
  return {};
}

export async function syncNow(clientId: string): Promise<{ error?: string }> {
  if (!(await allowed(clientId))) return { error: "אין הרשאה" };
  const admin = createAdminClient();
  const { data: integration } = await admin.from("integrations").select("id, client_id").eq("client_id", clientId).eq("provider", "meta").maybeSingle();
  if (!integration) return { error: "אין חיבור" };
  try {
    const { errors } = await syncMeta(admin, integration);
    revalidatePath(`/c/${clientId}`, "layout");
    return errors.length ? { error: `חלק מהנתונים לא זמינים: ${errors[0]}` } : {};
  } catch (e) {
    await admin.from("integrations").update({ status: "error", last_error: (e as Error).message }).eq("id", integration.id);
    revalidatePath(`/c/${clientId}`, "layout");
    return { error: (e as Error).message };
  }
}

// ניתוק: ההרשאה נמחקת; הנתונים שכבר נמשכו נשארים בדוחות
export async function disconnectIntegration(clientId: string, provider: string) {
  if (!(await allowed(clientId))) return;
  await createAdminClient().from("integrations").delete().eq("client_id", clientId).eq("provider", provider);
  revalidatePath(`/c/${clientId}`, "layout");
}
