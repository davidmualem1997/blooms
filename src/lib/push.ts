import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// העיקרון: פוש רק כשיש פעולה לעשות, שינוי משמעותי או דדליין שמתקרב. כל השאר נשאר בתוך האפליקציה.

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function pushConfigured() {
  // trim: ערכים שהוכנסו ל-Vercel דרך pipe מגיעים לפעמים עם ירידת שורה בסוף
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv || !process.env.SUPABASE_SECRET_KEY?.trim()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@blooms.app", pub, priv);
  return true;
}

// שולח התראה לכל המכשירים של המשתמשים. מכשיר שביטל את ההרשמה (404/410) נמחק
export async function sendPush(userIds: string[], payload: PushPayload) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length || !pushConfigured()) return 0;
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
      else console.error("push failed", code, (e as Error).message);
    }
  }));
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return sent;
}

// פעם אחת בלבד לכל מפתח (נרשם ביומן השליחה). מחזיר true אם זו הפעם הראשונה
export async function claimOnce(admin: SupabaseClient, key: string) {
  const { data } = await admin.from("notification_log").upsert({ key }, { onConflict: "key", ignoreDuplicates: true }).select("key");
  return (data ?? []).length > 0;
}

// מי מקבל, לפי הקשר ללקוח:
// manager – מנהל/ת הלקוח (ואם אין – מנהלת הסטודיו); team – מנהלת הסטודיו + מנהל/ת הלקוח; client – משתמשי הלקוח
export type Audience = "manager" | "team" | "client" | "owners";

export async function recipients(clientId: string, who: Audience): Promise<string[]> {
  const admin = createAdminClient();
  if (who === "client") {
    const { data } = await admin.from("client_users").select("user_id").eq("client_id", clientId);
    return (data ?? []).map((r) => r.user_id);
  }
  const { data: client } = await admin.from("clients").select("studio_id, manager_id").eq("id", clientId).single();
  if (!client) return [];
  if (who === "manager" && client.manager_id) return [client.manager_id];
  // owners: רק מנהלת הסטודיו (גם אם היא לא מנהלת את הלקוח)
  const { data: owners } = await admin.from("studio_members").select("user_id").eq("studio_id", client.studio_id).eq("role", "owner");
  return [...(owners ?? []).map((o) => o.user_id), ...(who === "team" && client.manager_id ? [client.manager_id] : [])];
}

// נשלח אחרי שהתשובה חזרה למשתמש, כדי לא להאט את הפעולה. מי שביצע את הפעולה לא מקבל עליה התראה.
// בלי כותרת – הכותרת היא שם הלקוח. עם once – נשלח פעם אחת בלבד לאותו מפתח
type Target = { clientId: string; who: Audience } | { userIds: string[]; clientId?: string };
export function notifyLater(target: Target, payload: Omit<PushPayload, "title"> & { title?: string }, actorId?: string | null, once?: string) {
  after(async () => {
    try {
      if (!pushConfigured()) return;
      const admin = createAdminClient();
      const ids = "userIds" in target ? target.userIds : await recipients(target.clientId, target.who);
      const targets = ids.filter((id) => id !== actorId);
      if (!targets.length) return;
      if (once && !(await claimOnce(admin, once))) return;
      let title = payload.title;
      if (!title && target.clientId) {
        const { data } = await admin.from("clients").select("name").eq("id", target.clientId).single();
        title = data?.name;
      }
      await sendPush(targets, { ...payload, title: title || "BLOOMS" });
    } catch (e) {
      console.error("notify failed", (e as Error).message);
    }
  });
}
