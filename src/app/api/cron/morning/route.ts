import { NextResponse, type NextRequest } from "next/server";
import { deadlines, todayIL, weekday } from "@/lib/dates";
import { sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

// תזכורת בוקר (Vercel Cron, כל יום חוץ משבת – ראו vercel.json):
// לצוות – מה עולה היום אצל הלקוחות שלהם ומה מחכה; ללקוח – מה מחכה לאישור שלו
export const maxDuration = 60;

type Item = { client_id: string; date: string; status: string };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const today = todayIL();
  const wd = weekday(today);
  if (wd === 6) return NextResponse.json({ ok: true, skipped: "shabbat" });
  const weekAgo = new Date(Date.parse(today) - 7 * 864e5).toISOString().slice(0, 10);

  const admin = createAdminClient();
  const [clients, owners, clientUsers, items, recurring, oneOff, messages] = await Promise.all([
    admin.from("clients").select("id, studio_id, manager_id"),
    admin.from("studio_members").select("studio_id, user_id").eq("role", "owner"),
    admin.from("client_users").select("client_id, user_id"),
    admin.from("content_items").select("client_id, date, status").gte("date", weekAgo).neq("status", "live"),
    admin.from("recurring_stories").select("client_id, weekdays"),
    admin.from("one_off_stories").select("client_id").eq("date", today),
    admin.from("messages").select("client_id").eq("status", "new"),
  ]);
  const firstError = [clients, owners, clientUsers, items, recurring, oneOff, messages].find((r) => r.error)?.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const its = (items.data ?? []) as Item[];
  const count = <T extends { client_id: string }>(rows: T[], ids: Set<string>, f: (r: T) => boolean = () => true) =>
    rows.filter((r) => ids.has(r.client_id) && f(r)).length;

  // הלקוחות של כל איש צוות: מנהלת הסטודיו – כולם; מנהל/ת – רק המשויכים
  const staff = new Map<string, Set<string>>();
  const add = (user: string, client: string) => { if (!staff.has(user)) staff.set(user, new Set()); staff.get(user)!.add(client); };
  for (const c of clients.data ?? []) {
    for (const o of owners.data ?? []) if (o.studio_id === c.studio_id) add(o.user_id, c.id);
    if (c.manager_id) add(c.manager_id, c.id);
  }

  const dl = deadlines(today);
  let sent = 0;
  for (const [user, ids] of staff) {
    const posts = count(its, ids, (i) => i.date === today);
    const stories = (recurring.data ?? []).filter((s) => ids.has(s.client_id) && (s.weekdays as number[]).includes(wd)).length + count(oneOff.data ?? [], ids);
    const review = count(its, ids, (i) => i.status === "review");
    const overdue = count(its, ids, (i) => i.date < today);
    const newReq = count(messages.data ?? [], ids);
    const parts: string[] = [];
    if (posts || stories) parts.push(`היום: ${[posts && `${posts} פרסומים`, stories && `${stories} סטוריז`].filter(Boolean).join(" ו־")}`);
    if (review) parts.push(`${review} מחכים לבדיקה`);
    if (overdue) parts.push(`${overdue} לא סומנו שעלו`);
    if (newReq) parts.push(`${newReq} פניות חדשות`);
    if (dl.submit.days <= 2) parts.push(dl.submit.days === 0 ? "היום הגשת התוכנית החודשית" : `עוד ${dl.submit.days} ימים להגשת התוכנית`);
    if (parts.length) sent += await sendPush([user], { title: "בוקר טוב 🌸", body: parts.join(" · "), url: "/", tag: "morning" });
  }

  const waiting = new Map<string, number>();
  for (const cu of clientUsers.data ?? []) {
    const n = its.filter((i) => i.client_id === cu.client_id && i.status === "client").length;
    if (n) waiting.set(cu.user_id, (waiting.get(cu.user_id) ?? 0) + n);
  }
  for (const [user, n] of waiting) {
    sent += await sendPush([user], { title: "בוקר טוב 🌸", body: n === 1 ? "תוכן אחד מחכה לאישור שלך" : `${n} תכנים מחכים לאישור שלך`, url: "/", tag: "morning" });
  }

  return NextResponse.json({ ok: true, sent });
}
