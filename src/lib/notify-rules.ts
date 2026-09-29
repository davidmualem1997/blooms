import "server-only";
import { formatIL } from "@/lib/dates";
import { addDays, planNotifications, type Planned, type Snapshot } from "@/lib/notify-plan";
import { sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// ההתראות המתוזמנות: רץ כל 10 דקות (pg_cron ב-Supabase). הכללים עצמם ב-notify-plan.ts.
// כל התראה נרשמת ביומן (notification_log) ולא נשלחת שוב.
// dry: רק מחזיר מה היה נשלח, בלי לשלוח ובלי לרשום. at: הרצה כאילו השעה עכשיו היא at – לבדיקות
export async function runNotifications(opts: { dry?: boolean; at?: number } = {}): Promise<{ sent: number; planned: Planned[] }> {
  const now = opts.at ?? Date.now();
  const admin = createAdminClient();
  const today = formatIL(new Date(now).toISOString()).date;
  const from = new Date(now).toISOString();
  const to = new Date(now + 26 * 3600e3).toISOString();

  const res = await Promise.all([
    admin.from("clients").select("id, name, studio_id, manager_id"),
    admin.from("studio_members").select("studio_id, user_id").eq("role", "owner"),
    admin.from("client_users").select("client_id, user_id"),
    admin.from("content_items").select("id, client_id, date, time, type, title, caption, status, media").gte("date", addDays(today, -7)),
    admin.from("recurring_stories").select("client_id, weekdays"),
    admin.from("one_off_stories").select("client_id, date").eq("date", today),
    admin.from("messages").select("id, client_id, created_at").eq("status", "new"),
    admin.from("meetings").select("id, client_id, starts_at, location").gte("starts_at", from).lte("starts_at", to),
    admin.from("team_meetings").select("id, studio_id, starts_at, location, attendee_ids").gte("starts_at", from).lte("starts_at", to),
    admin.from("client_events").select("id, client_id, date, title, needs_material").eq("needs_material", true).gte("date", today).lte("date", addDays(today, 3)),
    admin.from("notification_log").select("key"),
  ]);
  const failed = res.find((r) => r.error)?.error;
  if (failed) throw new Error(failed.message);
  const [clients, owners, clientUsers, items, recurring, oneOff, messages, meetings, teamMeetings, events, log] = res.map((r) => r.data ?? []);

  const snapshot = { clients, owners, clientUsers, items, recurring, oneOff, messages, meetings, teamMeetings, events } as unknown as Snapshot;
  const planned = planNotifications(snapshot, now, new Set((log as { key: string }[]).map((l) => l.key)));
  if (opts.dry) return { sent: 0, planned };

  let sent = 0;
  for (const p of planned) {
    // רושמים לפני השליחה: אם שתי ריצות חופפות, רק אחת תשלח
    const { data } = await admin.from("notification_log").upsert(p.claims.map((key) => ({ key })), { onConflict: "key", ignoreDuplicates: true }).select("key");
    if (!data?.length) continue;
    sent += await sendPush(p.to, { title: p.title, body: p.body, url: p.url, tag: p.tag });
  }
  await admin.from("notification_log").delete().lt("sent_at", new Date(now - 90 * 864e5).toISOString());
  return { sent, planned };
}
