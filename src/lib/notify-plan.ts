import { deadlines, formatIL, israelToUTC, monthName, parseISODate, toISODate, WEEKDAYS } from "@/lib/dates";
import { TYPE_LABEL, type ContentType } from "@/lib/types";

// מה לשלוח עכשיו – פונקציה טהורה (בלי מסד נתונים), כדי שאפשר לבדוק כל כלל בנפרד.
// העיקרון: פוש רק כשיש פעולה לעשות, שינוי משמעותי או דדליין שמתקרב.
//   ללקוח:        תכנים חדשים לאישור (מקובצים), תזכורת אחת לפני סוף מועד האישור, אירוע קרוב שמחכה לחומרים ממנו
//   למנהל/ת לקוח: סיכום בוקר, תוכן שעולה בקרוב, תוכן שלא סומן שעלה, חסר קובץ/טקסט, פגישה בעוד שעה, דדליין הגשה
//   למנהלת הסטודיו: רק חריגים – בבוקר מה דורש אותה, פנייה שמחכה יומיים, דדליין שלא הושלם, סיכום ערב

export type Snapshot = {
  clients: { id: string; name: string; studio_id: string; manager_id: string | null }[];
  owners: { studio_id: string; user_id: string }[];
  clientUsers: { client_id: string; user_id: string }[];
  items: { id: string; client_id: string; date: string; time: string | null; type: ContentType; title: string; caption: string; status: string; media: unknown[] }[];
  recurring: { client_id: string; weekdays: number[] }[];
  oneOff: { client_id: string; date: string }[];
  messages: { id: string; client_id: string; created_at: string }[]; // פניות בסטטוס "חדש"
  meetings: { id: string; client_id: string; starts_at: string; location: string }[];
  teamMeetings: { id: string; studio_id: string; starts_at: string; location: string; attendee_ids: string[] }[];
  events: { id: string; client_id: string; date: string; title: string; needs_material: boolean }[];
};

// claims – מפתחות ביומן השליחה; התראה נשלחת רק אם אף אחד מהם עוד לא נרשם
export type Planned = { claims: string[]; to: string[]; title: string; body: string; url: string; tag: string };

export const WINDOWS = {
  quiet: [7 * 60 + 30, 21 * 60 + 30], // לא שולחים בלילה
  morning: [8 * 60, 11 * 60],
  evening: [18 * 60, 20 * 60],
  lateDay: [20 * 60, 21 * 60 + 30],
};
const within = (m: number, [a, b]: number[]) => m >= a && m < b;

const hhmm = (t: string) => t.slice(0, 5);
export const addDays = (iso: string, n: number) => { const d = parseISODate(iso); d.setUTCDate(d.getUTCDate() + n); return toISODate(d); };
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

export function planNotifications(s: Snapshot, now: number, logged: Set<string>): Planned[] {
  const { date: today, time } = formatIL(new Date(now).toISOString());
  const [h, mi] = time.split(":").map(Number);
  const minutes = h * 60 + mi;
  if (!within(minutes, WINDOWS.quiet)) return [];

  const out: Planned[] = [];
  const taken = new Set(logged); // גם מה שכבר נכלל בהתראה אחרת בריצה הזאת
  const add = (key: string, to: string[], title: string, body: string, url: string, alsoCovers: string[] = []) => {
    if (!to.length || taken.has(key)) return;
    const claims = [key, ...alsoCovers.filter((k) => !taken.has(k))];
    claims.forEach((k) => taken.add(k));
    out.push({ claims, to: [...new Set(to)], title, body, url, tag: key.split(":")[0] });
  };
  // "2 תכנים וסטורי אחד" / "2 תכנים ו־3 סטוריז"
  const and = (parts: string[]) => parts.reduce((a, b) => (a ? `${a} ${/^\d/.test(b) ? "ו־" : "ו"}${b}` : b), "");

  const tomorrow = addDays(today, 1);
  const wd = parseISODate(today).getUTCDay();
  const saturday = wd === 6;
  const dl = deadlines(today);
  const byId = new Map(s.clients.map((c) => [c.id, c]));
  const open = s.items.filter((i) => i.status !== "live");
  const ownersOf = (studioId: string) => s.owners.filter((o) => o.studio_id === studioId).map((o) => o.user_id);
  const managerOf = (c: Snapshot["clients"][number]) => (c.manager_id ? [c.manager_id] : ownersOf(c.studio_id));
  const usersOf = (clientId: string) => s.clientUsers.filter((u) => u.client_id === clientId).map((u) => u.user_id);
  const itemUrl = (i: { id: string; client_id: string; date: string }) => `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}&item=${i.id}`;

  // ================= ללקוח =================

  // תכנים חדשים שמחכים לאישור – הודעה אחת לכל הקבוצה שנשלחה
  const fresh = open.filter((i) => i.status === "client" && i.date >= today && !logged.has(`approve:${i.id}`));
  for (const clientId of new Set(fresh.map((i) => i.client_id))) {
    const batch = fresh.filter((i) => i.client_id === clientId);
    const to = usersOf(clientId);
    if (to.length) out.push({
      claims: batch.map((i) => `approve:${i.id}`), to, title: byId.get(clientId)?.name ?? "BLOOMS", tag: "approve", url: `/c/${clientId}`,
      body: batch.length === 1 ? "תוכן חדש מחכה לאישור שלך" : `${batch.length} תכנים חדשים מחכים לאישור שלך`,
    });
  }

  // תזכורת אחת, יום־יומיים לפני סוף מועד האישור
  if (dl.approve.days >= 1 && dl.approve.days <= 2 && minutes >= 10 * 60) {
    for (const c of s.clients) {
      const pending = open.some((i) => i.client_id === c.id && i.status === "client" && i.date.slice(0, 7) === dl.approve.month.slice(0, 7));
      if (pending) add(`approve-remind:${c.id}:${dl.approve.month}`, usersOf(c.id), c.name, `תוכנית ${monthName(dl.approve.month)} עדיין מחכה לאישור שלך`, `/c/${c.id}`);
    }
  }

  // אירוע קרוב (עד 3 ימים) שמחכה לחומרים מהלקוח
  if (minutes >= 10 * 60) {
    for (const e of s.events) {
      const c = byId.get(e.client_id);
      if (!c || !e.needs_material || e.date < tomorrow || e.date > addDays(today, 3)) continue;
      const when = e.date === tomorrow ? "מחר" : `ביום ${WEEKDAYS[parseISODate(e.date).getUTCDay()]}`;
      add(`material:${e.id}`, usersOf(c.id), c.name, `האירוע "${e.title}" ${when} מתקרב ועדיין חסרים חומרים ממך`, `/c/${c.id}/file?tab=events`);
    }
  }

  // ================= למנהל/ת לקוח =================

  const managed = new Map<string, Snapshot["clients"]>(); // מי מנהל/ת אילו לקוחות (בלי מנהל – מנהלת הסטודיו)
  for (const c of s.clients) for (const u of managerOf(c)) managed.set(u, [...(managed.get(u) ?? []), c]);

  for (const i of open) {
    const c = byId.get(i.client_id);
    if (!c) continue;
    const what = `${TYPE_LABEL[i.type]} "${i.title}"`;

    // תוכן עם שעה: תזכורת לפני העלאה, ובדיקה שסומן שעלה
    if (i.date === today && i.time) {
      const diff = Math.round((Date.parse(israelToUTC(i.date, hhmm(i.time))) - now) / 60000);
      if (diff > 0 && diff <= 60) add(`soon:${i.id}`, managerOf(c), c.name, `בעוד ${Math.max(5, Math.round(diff / 5) * 5)} דקות עולה ${what}`, itemUrl(i));
      if (diff <= -30) add(`late:${i.id}`, managerOf(c), c.name, `${what} היה אמור לעלות ב־${hhmm(i.time)} ועדיין לא סומן שעלה`, itemUrl(i));
    }

    // חסר קובץ או טקסט לתוכן של היום/מחר
    if ((i.date === today || i.date === tomorrow) && minutes >= 9 * 60) {
      const missing = [!i.media.length && "קובץ", !i.caption.trim() && "טקסט"].filter(Boolean).join(" ו");
      if (missing) add(`missing:${i.id}:${i.date}`, managerOf(c), c.name, `חסר ${missing} ל${what} של ${i.date === today ? "היום" : "מחר"}`, itemUrl(i));
    }
  }

  // תוכן בלי שעה שעוד לא סומן שעלה – הודעה אחת בערב
  if (within(minutes, WINDOWS.lateDay)) {
    for (const [user, cs] of managed) {
      const ids = new Set(cs.map((c) => c.id));
      const n = open.filter((i) => ids.has(i.client_id) && i.date === today && !i.time).length;
      if (n) add(`late-day:${user}:${today}`, [user], "BLOOMS", `${plural(n, "תוכן אחד של היום עוד לא סומן", "תכנים של היום עוד לא סומנו")} שעלה`, "/");
    }
  }

  // פגישה בעוד שעה
  for (const m of s.meetings) {
    const c = byId.get(m.client_id);
    const diff = (Date.parse(m.starts_at) - now) / 60000;
    if (c && diff > 0 && diff <= 60) add(`meet:${m.id}`, managerOf(c), c.name, `פגישה בעוד שעה, ב־${formatIL(m.starts_at).time}${m.location ? ` · ${m.location}` : ""}`, `/c/${c.id}/file?tab=meetings`);
  }
  for (const m of s.teamMeetings) {
    const diff = (Date.parse(m.starts_at) - now) / 60000;
    if (diff > 0 && diff <= 60) add(`tmeet:${m.id}`, [...m.attendee_ids, ...ownersOf(m.studio_id)], "פגישת צוות", `בעוד שעה, ב־${formatIL(m.starts_at).time}${m.location ? ` · ${m.location}` : ""}`, "/");
  }

  // דדליין הגשת התוכנית החודשית (ה־20)
  const notSubmitted = (cs: Snapshot["clients"]) => cs.filter((c) => {
    const its = s.items.filter((i) => i.client_id === c.id && i.date.slice(0, 7) === dl.submit.month.slice(0, 7));
    return !its.length || its.some((i) => i.status === "work" || i.status === "review");
  });
  const dueText = dl.submit.days === 0 ? "היום" : dl.submit.days === 1 ? "מחר" : `בעוד ${dl.submit.days} ימים`;
  const lateText = (late: Snapshot["clients"]) => (late.length === 1 ? `${late[0].name} עוד לא הוגש` : `${late.length} לקוחות עוד לא הוגשו`);
  if (dl.submit.days <= 2 && minutes >= 9 * 60) {
    for (const [user, cs] of managed) {
      const late = notSubmitted(cs);
      const gantt = late.length === 1 ? `/c/${late[0].id}/gantt?m=${dl.submit.month.slice(0, 7)}` : "/";
      if (late.length) add(`deadline:${user}:${dl.submit.date}`, [user], "דדליין מתקרב", `הגשת תוכנית ${monthName(dl.submit.month)} ${dueText} · ${lateText(late)}`, gantt);
    }
  }

  // ================= סיכום בוקר (למנהלים) וחריגים (למנהלת הסטודיו) =================

  const studiosOf = new Map<string, string[]>(); // מנהלת → הסטודיואים שלה
  for (const o of s.owners) studiosOf.set(o.user_id, [...(studiosOf.get(o.user_id) ?? []), o.studio_id]);
  const staleCutoff = new Date(now - 48 * 3600e3).toISOString();

  // מה דורש את מנהלת הסטודיו: חריגים בכל הסטודיו
  const exceptions = (user: string) => {
    const cs = s.clients.filter((c) => studiosOf.get(user)?.includes(c.studio_id));
    const ids = new Set(cs.map((c) => c.id));
    const late = dl.submit.days <= 3 ? notSubmitted(cs) : [];
    const ex = {
      review: open.filter((i) => ids.has(i.client_id) && i.status === "review").length,
      overdue: open.filter((i) => ids.has(i.client_id) && i.date < today).length,
      stale: s.messages.filter((m) => ids.has(m.client_id) && m.created_at < staleCutoff),
      late,
      todayOpen: open.filter((i) => ids.has(i.client_id) && i.date === today).length,
      newReq: s.messages.filter((m) => ids.has(m.client_id)).length,
    };
    const lines = [
      ex.review && (ex.review === 1 ? "תוכן אחד מחכה לבדיקה שלך" : `${ex.review} תכנים מחכים לבדיקה שלך`),
      ex.overdue && (ex.overdue === 1 ? "תוכן אחד לא עלה בזמן" : `${ex.overdue} תכנים לא עלו בזמן`),
      ex.stale.length && (ex.stale.length === 1 ? "פנייה מחכה יומיים" : `${ex.stale.length} פניות מחכות יומיים`),
      late.length && `תוכנית ${monthName(dl.submit.month)}: ${lateText(late)}`,
    ].filter(Boolean) as string[];
    return { ...ex, lines };
  };

  if (!saturday && within(minutes, WINDOWS.morning)) {
    for (const user of new Set([...managed.keys(), ...studiosOf.keys()])) {
      const ids = new Set((managed.get(user) ?? []).map((c) => c.id));
      const posts = open.filter((i) => ids.has(i.client_id) && i.date === today).length;
      const stories = s.recurring.filter((r) => ids.has(r.client_id) && r.weekdays.includes(wd)).length
        + s.oneOff.filter((o) => ids.has(o.client_id) && o.date === today).length;
      const approvals = open.filter((i) => ids.has(i.client_id) && i.status === "client").length;
      const meetings = s.meetings.filter((m) => ids.has(m.client_id) && formatIL(m.starts_at).date === today).length
        + s.teamMeetings.filter((m) => formatIL(m.starts_at).date === today && (m.attendee_ids.includes(user) || studiosOf.get(user)?.includes(m.studio_id))).length;
      const requests = s.messages.filter((m) => ids.has(m.client_id)).length;

      const lines = [
        (posts || stories) && `היום עולים: ${and([posts && plural(posts, "תוכן אחד", "תכנים"), stories && plural(stories, "סטורי אחד", "סטוריז")].filter(Boolean) as string[])}`,
        approvals && (approvals === 1 ? "תוכן אחד מחכה לאישור הלקוח" : `${approvals} תכנים מחכים לאישור הלקוח`),
        meetings && (meetings === 1 ? "פגישה אחת" : `${meetings} פגישות`),
        requests && (requests === 1 ? "פנייה חדשה אחת" : `${requests} פניות חדשות`),
      ].filter(Boolean) as string[];
      // אצל מנהלת הסטודיו החריגים באים ראשונים; פנייה תקועה שמופיעה בסיכום לא נשלחת שוב בנפרד
      const ex = studiosOf.has(user) ? exceptions(user) : null;
      if (ex) lines.unshift(...ex.lines);
      if (lines.length) add(`morning:${user}:${today}`, [user], "הבוקר שלך ב־BLOOMS", lines.map((l) => `• ${l}`).join("\n"), "/", ex?.stale.map((m) => `stale:${m.id}`));
    }
  }

  for (const user of studiosOf.keys()) {
    const ex = exceptions(user);
    // לקוח שמחכה לטיפול כבר יומיים
    for (const m of ex.stale) {
      const c = byId.get(m.client_id);
      if (c) add(`stale:${m.id}`, [user], c.name, "פנייה מחכה לטיפול כבר יומיים", `/c/${c.id}/requests`);
    }
    // סיכום ערב: מה נשאר פתוח
    if (!saturday && within(minutes, WINDOWS.evening)) {
      const left = [
        ex.todayOpen && (ex.todayOpen === 1 ? "תוכן אחד של היום לא סומן שעלה" : `${ex.todayOpen} תכנים של היום לא סומנו שעלו`),
        ex.newReq && (ex.newReq === 1 ? "פנייה אחת לא טופלה" : `${ex.newReq} פניות לא טופלו`),
        ex.review && (ex.review === 1 ? "תוכן אחד מחכה לבדיקה שלך" : `${ex.review} תכנים מחכים לבדיקה שלך`),
      ].filter(Boolean) as string[];
      if (left.length) add(`evening:${user}:${today}`, [user], "סוף היום ב־BLOOMS", left.map((l) => `• ${l}`).join("\n"), "/");
    }
  }

  return out;
}
