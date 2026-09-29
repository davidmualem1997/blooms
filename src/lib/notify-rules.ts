import "server-only";
import { deadlines, formatIL, israelToUTC, monthName, parseISODate, todayIL, toISODate, WEEKDAYS } from "@/lib/dates";
import { claimOnce, sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { TYPE_LABEL, type ContentType } from "@/lib/types";

// ההתראות המתוזמנות. רץ כל 10 דקות (pg_cron ב-Supabase), וכל התראה נשלחת פעם אחת בלבד (notification_log).
//   ללקוח:        תכנים חדשים לאישור (מקובצים), תזכורת אחת לפני סוף מועד האישור, אירוע קרוב שמחכה לחומרים ממנו
//   למנהל/ת לקוח: סיכום בוקר, תוכן שעולה בקרוב, תוכן שלא סומן שעלה, חסר קובץ/טקסט, פגישה בעוד שעה, דדליין הגשה
//   למנהלת הסטודיו: רק חריגים – סיכום בוקר של מה שדורש אותה, פנייה שמחכה זמן רב, דדליין שלא הושלם, סיכום ערב

type Item = { id: string; client_id: string; date: string; time: string | null; type: ContentType; title: string; caption: string; status: string; media: unknown[] };
type Client = { id: string; name: string; studio_id: string; manager_id: string | null };

const QUIET = { from: 7 * 60 + 30, to: 21 * 60 + 30 }; // לא שולחים בלילה

function nowIL() {
  const { time } = formatIL(new Date().toISOString());
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
const hhmm = (t: string) => t.slice(0, 5);
const addDays = (iso: string, n: number) => { const d = parseISODate(iso); d.setUTCDate(d.getUTCDate() + n); return toISODate(d); };
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

export async function runNotifications() {
  const minutes = nowIL();
  if (minutes < QUIET.from || minutes >= QUIET.to) return { sent: 0, quiet: true };

  const admin = createAdminClient();
  const today = todayIL();
  const tomorrow = addDays(today, 1);
  const wd = parseISODate(today).getUTCDay();
  const saturday = wd === 6;
  const dl = deadlines(today);
  const now = Date.now();
  const in26h = new Date(now + 26 * 3600e3).toISOString();

  const [clientsR, ownersR, cuR, itemsR, recurringR, oneOffR, messagesR, meetingsR, teamR, eventsR] = await Promise.all([
    admin.from("clients").select("id, name, studio_id, manager_id"),
    admin.from("studio_members").select("studio_id, user_id").eq("role", "owner"),
    admin.from("client_users").select("client_id, user_id"),
    admin.from("content_items").select("id, client_id, date, time, type, title, caption, status, media").gte("date", addDays(today, -7)),
    admin.from("recurring_stories").select("client_id, weekdays"),
    admin.from("one_off_stories").select("client_id").eq("date", today),
    admin.from("messages").select("id, client_id, created_at").eq("status", "new"),
    admin.from("meetings").select("id, client_id, starts_at, location").gte("starts_at", new Date(now).toISOString()).lte("starts_at", in26h),
    admin.from("team_meetings").select("id, studio_id, starts_at, location, attendee_ids").gte("starts_at", new Date(now).toISOString()).lte("starts_at", in26h),
    admin.from("client_events").select("id, client_id, date, title").eq("needs_material", true).gte("date", tomorrow).lte("date", addDays(today, 3)),
  ]);
  const failed = [clientsR, ownersR, cuR, itemsR, recurringR, oneOffR, messagesR, meetingsR, teamR, eventsR].find((r) => r.error)?.error;
  if (failed) throw new Error(failed.message);

  const clients = (clientsR.data ?? []) as Client[];
  const byId = new Map(clients.map((c) => [c.id, c]));
  const items = (itemsR.data ?? []) as Item[];
  const open = items.filter((i) => i.status !== "live");
  const ownersOf = (studioId: string) => (ownersR.data ?? []).filter((o) => o.studio_id === studioId).map((o) => o.user_id);
  const managerOf = (c: Client) => (c.manager_id ? [c.manager_id] : ownersOf(c.studio_id));
  const usersOf = (clientId: string) => (cuR.data ?? []).filter((u) => u.client_id === clientId).map((u) => u.user_id);
  const url = (i: { client_id: string; date: string }) => `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`;

  let sent = 0;
  async function send(key: string, users: string[], title: string, body: string, link: string) {
    if (!users.length || !(await claimOnce(admin, key))) return;
    sent += await sendPush(users, { title, body, url: link, tag: key.split(":")[0] });
  }

  // ================= ללקוח =================

  // תכנים חדשים שמחכים לאישור – הודעה אחת לכל הקבוצה שנשלחה
  const waiting = open.filter((i) => i.status === "client" && i.date >= today);
  if (waiting.length) {
    const { data: done } = await admin.from("notification_log").select("key").in("key", waiting.map((i) => `approve:${i.id}`));
    const seen = new Set((done ?? []).map((d) => d.key));
    const fresh = waiting.filter((i) => !seen.has(`approve:${i.id}`));
    for (const clientId of new Set(fresh.map((i) => i.client_id))) {
      const batch = fresh.filter((i) => i.client_id === clientId);
      await admin.from("notification_log").upsert(batch.map((i) => ({ key: `approve:${i.id}` })), { onConflict: "key", ignoreDuplicates: true });
      const users = usersOf(clientId);
      if (users.length) sent += await sendPush(users, {
        title: byId.get(clientId)?.name ?? "BLOOMS",
        body: batch.length === 1 ? "תוכן חדש מחכה לאישור שלך" : `${batch.length} תכנים חדשים מחכים לאישור שלך`,
        url: `/c/${clientId}`, tag: "approve",
      });
    }
  }

  // תזכורת אחת, יום־יומיים לפני סוף מועד האישור
  if (dl.approve.days >= 1 && dl.approve.days <= 2 && minutes >= 10 * 60) {
    for (const c of clients) {
      const pending = open.some((i) => i.client_id === c.id && i.status === "client" && i.date.slice(0, 7) === dl.approve.month.slice(0, 7));
      if (pending) await send(`approve-remind:${c.id}:${dl.approve.month}`, usersOf(c.id), c.name, `תוכנית ${monthName(dl.approve.month)} עדיין מחכה לאישור שלך`, `/c/${c.id}`);
    }
  }

  // אירוע קרוב שמחכה לחומרים מהלקוח
  if (minutes >= 10 * 60) {
    for (const e of eventsR.data ?? []) {
      const c = byId.get(e.client_id);
      if (!c) continue;
      const when = e.date === tomorrow ? "מחר" : `ביום ${WEEKDAYS[parseISODate(e.date).getUTCDay()]}`;
      await send(`material:${e.id}`, usersOf(c.id), c.name, `האירוע "${e.title}" ${when} מתקרב ועדיין חסרים חומרים ממך`, `/c/${c.id}/file`);
    }
  }

  // ================= למנהל/ת לקוח =================

  const managed = new Map<string, Client[]>(); // מי מנהל/ת אילו לקוחות (בלי מנהל – מנהלת הסטודיו)
  for (const c of clients) for (const u of managerOf(c)) managed.set(u, [...(managed.get(u) ?? []), c]);

  for (const i of open) {
    const c = byId.get(i.client_id);
    if (!c) continue;
    const what = `${TYPE_LABEL[i.type]} "${i.title}"`;

    // תוכן עם שעה: תזכורת לפני העלאה, ובדיקה שסומן שעלה
    if (i.date === today && i.time) {
      const diff = Math.round((Date.parse(israelToUTC(i.date, hhmm(i.time))) - now) / 60000);
      if (diff > 0 && diff <= 60) await send(`soon:${i.id}`, managerOf(c), c.name, `בעוד ${Math.max(5, Math.round(diff / 5) * 5)} דקות עולה ${what}`, url(i));
      if (diff <= -30) await send(`late:${i.id}`, managerOf(c), c.name, `${what} היה אמור לעלות ב־${hhmm(i.time)} ועדיין לא סומן שעלה`, url(i));
    }

    // חסר קובץ או טקסט לתוכן של היום/מחר
    if ((i.date === today || i.date === tomorrow) && minutes >= 9 * 60) {
      const missing = [!i.media.length && "קובץ", !i.caption.trim() && "טקסט"].filter(Boolean).join(" ו");
      if (missing) await send(`missing:${i.id}:${i.date}`, managerOf(c), c.name, `חסר ${missing} ל${what} של ${i.date === today ? "היום" : "מחר"}`, url(i));
    }
  }

  // תוכן בלי שעה שעוד לא סומן שעלה – הודעה אחת בערב
  if (minutes >= 20 * 60) {
    for (const [user, cs] of managed) {
      const ids = new Set(cs.map((c) => c.id));
      const n = open.filter((i) => ids.has(i.client_id) && i.date === today && !i.time).length;
      if (n) await send(`late-day:${user}:${today}`, [user], "BLOOMS", `${plural(n, "תוכן אחד של היום עוד לא סומן", "תכנים של היום עוד לא סומנו")} שעלה`, "/");
    }
  }

  // פגישה בעוד שעה
  for (const m of meetingsR.data ?? []) {
    const c = byId.get(m.client_id);
    const diff = (Date.parse(m.starts_at) - now) / 60000;
    if (c && diff <= 60) await send(`meet:${m.id}`, managerOf(c), c.name, `פגישה בעוד שעה, ב־${formatIL(m.starts_at).time}${m.location ? ` · ${m.location}` : ""}`, `/c/${c.id}/file`);
  }
  for (const m of teamR.data ?? []) {
    const diff = (Date.parse(m.starts_at) - now) / 60000;
    if (diff <= 60) await send(`tmeet:${m.id}`, [...new Set([...(m.attendee_ids as string[]), ...ownersOf(m.studio_id)])], "פגישת צוות", `בעוד שעה, ב־${formatIL(m.starts_at).time}${m.location ? ` · ${m.location}` : ""}`, "/");
  }

  // דדליין הגשת התוכנית החודשית (ה־20)
  const notSubmitted = (cs: Client[]) => cs.filter((c) => {
    const its = items.filter((i) => i.client_id === c.id && i.date.slice(0, 7) === dl.submit.month.slice(0, 7));
    return !its.length || its.some((i) => i.status === "work" || i.status === "review");
  });
  const dueText = dl.submit.days === 0 ? "היום" : dl.submit.days === 1 ? "מחר" : `בעוד ${dl.submit.days} ימים`;
  if (dl.submit.days <= 2 && minutes >= 9 * 60) {
    for (const [user, cs] of managed) {
      const late = notSubmitted(cs);
      if (late.length) await send(`deadline:${user}:${dl.submit.date}`, [user], "דדליין מתקרב", `הגשת תוכנית ${monthName(dl.submit.month)} ${dueText} · ${late.length === 1 ? `${late[0].name} עוד לא הוגש` : `${late.length} לקוחות עוד לא הוגשו`}`, "/");
    }
  }

  // ================= סיכום בוקר (למנהלים) וחריגים (למנהלת הסטודיו) =================

  const studioOwners = new Map<string, string[]>(); // מנהלת → הסטודיואים שלה
  for (const o of ownersR.data ?? []) studioOwners.set(o.user_id, [...(studioOwners.get(o.user_id) ?? []), o.studio_id]);
  const staleCutoff = new Date(now - 48 * 3600e3).toISOString();

  // מה דורש את מנהלת הסטודיו: חריגים בכל הסטודיו
  const exceptions = (user: string) => {
    const cs = clients.filter((c) => studioOwners.get(user)?.includes(c.studio_id));
    const ids = new Set(cs.map((c) => c.id));
    return {
      review: open.filter((i) => ids.has(i.client_id) && i.status === "review").length,
      overdue: open.filter((i) => ids.has(i.client_id) && i.date < today).length,
      stale: (messagesR.data ?? []).filter((m) => ids.has(m.client_id) && m.created_at < staleCutoff),
      deadline: dl.submit.days <= 3 ? notSubmitted(cs).length : 0,
      todayOpen: open.filter((i) => ids.has(i.client_id) && i.date === today).length,
      newReq: (messagesR.data ?? []).filter((m) => ids.has(m.client_id)).length,
    };
  };

  if (!saturday && minutes >= 8 * 60) {
    const people = new Set([...managed.keys(), ...studioOwners.keys()]);
    for (const user of people) {
      const cs = managed.get(user) ?? [];
      const ids = new Set(cs.map((c) => c.id));
      const posts = open.filter((i) => ids.has(i.client_id) && i.date === today).length;
      const stories = (recurringR.data ?? []).filter((s) => ids.has(s.client_id) && (s.weekdays as number[]).includes(wd)).length
        + (oneOffR.data ?? []).filter((s) => ids.has(s.client_id)).length;
      const approvals = open.filter((i) => ids.has(i.client_id) && i.status === "client").length;
      const meetings = (meetingsR.data ?? []).filter((m) => ids.has(m.client_id) && formatIL(m.starts_at).date === today).length
        + (teamR.data ?? []).filter((m) => formatIL(m.starts_at).date === today && ((m.attendee_ids as string[]).includes(user) || studioOwners.get(user)?.includes(m.studio_id))).length;
      const requests = (messagesR.data ?? []).filter((m) => ids.has(m.client_id)).length;

      const lines = [
        (posts || stories) && `היום עולים: ${[posts && plural(posts, "תוכן אחד", "תכנים"), stories && plural(stories, "סטורי אחד", "סטוריז")].filter(Boolean).join(" ו־")}`,
        approvals && (approvals === 1 ? "תוכן אחד מחכה לאישור הלקוח" : `${approvals} תכנים מחכים לאישור הלקוח`),
        meetings && plural(meetings, "פגישה אחת", "פגישות"),
        requests && plural(requests, "פנייה חדשה אחת", "פניות חדשות"),
      ].filter(Boolean) as string[];

      if (studioOwners.has(user)) {
        const ex = exceptions(user);
        const count = ex.review + ex.overdue + ex.stale.length + (ex.deadline ? 1 : 0);
        if (count) lines.unshift(`${plural(count, "דבר אחד דורש", "דברים דורשים")} אותך היום`);
      }
      if (lines.length) await send(`morning:${user}:${today}`, [user], "הבוקר שלך ב־BLOOMS", lines.map((l) => `• ${l}`).join("\n"), "/");
    }
  }

  for (const user of studioOwners.keys()) {
    const ex = exceptions(user);
    // לקוח שמחכה לטיפול כבר יומיים
    for (const m of ex.stale) {
      const c = byId.get(m.client_id);
      if (c) await send(`stale:${m.id}`, [user], c.name, "פנייה מחכה לטיפול כבר יומיים", `/c/${c.id}/requests`);
    }
    // סיכום ערב: מה נשאר פתוח
    if (!saturday && minutes >= 18 * 60) {
      const left = ex.todayOpen + ex.newReq + ex.review;
      if (left) await send(`evening:${user}:${today}`, [user], "סוף היום ב־BLOOMS", `${plural(left, "פריט אחד נשאר פתוח", "פריטים נשארו פתוחים")}`, "/");
    }
  }

  // ניקוי היומן
  await admin.from("notification_log").delete().lt("sent_at", new Date(now - 90 * 864e5).toISOString());
  return { sent };
}
