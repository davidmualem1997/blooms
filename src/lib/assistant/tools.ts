import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppContext } from "@/lib/context";
import { israelToUTC, monthRange, todayIL } from "@/lib/dates";
import type { Brand } from "@/lib/types";

// כלים לקריאה בלבד. כולם רצים עם החיבור של המשתמש ששואל – RLS מגביל אותם בדיוק למה שהוא רשאי לראות.

const nullableStr = { type: ["string", "null"] } as const;
const params = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties: props, required: Object.keys(props) });
const CLIENT = { ...nullableStr, description: "שם הלקוח (או חלק ממנו) או המזהה שלו; null = כל הלקוחות" };
const DATE = (d: string) => ({ ...nullableStr, description: `${d} בפורמט YYYY-MM-DD, או null` });

export const TOOL_DEFS = [
  { name: "list_clients", description: "רשימת הלקוחות שהמשתמש רואה, עם מנהל/ת הלקוח והתחום", parameters: params({}) },
  { name: "get_client_file", description: "תיק הלקוח: סיפור, ערכים, קהל, טון, מה כן/לא, צבעים, שעות, אנשי קשר, רשתות, שאלות נפוצות, תפעול", parameters: params({ client: { type: "string", description: "שם הלקוח או המזהה" } }) },
  { name: "get_content", description: "תכנים (פוסט/ריל/טיקטוק) בטווח תאריכים, עם סטטוס, שעה, טקסט ונתונים אם עלו", parameters: params({ client: CLIENT, from: DATE("מתאריך"), to: DATE("עד תאריך"), status: { type: ["string", "null"], enum: ["work", "review", "client", "ok", "live", null], description: "סינון לפי סטטוס" } }) },
  { name: "get_pending", description: "מה פתוח עכשיו: תכנים שמחכים לאישור הלקוח, מחכים לבדיקה, לא סומנו שעלו, פניות חדשות ובטיפול", parameters: params({ client: CLIENT }) },
  { name: "get_requests", description: "פניות של לקוחות עם הסטטוס והתשובות", parameters: params({ client: CLIENT, status: { type: ["string", "null"], enum: ["new", "in_progress", "done", "to_meeting", null] } }) },
  { name: "get_schedule", description: "פגישות עם לקוחות, פגישות צוות, אירועים וסטוריז בטווח תאריכים", parameters: params({ client: CLIENT, from: DATE("מתאריך"), to: DATE("עד תאריך") }) },
  { name: "get_report", description: "נתוני הדוח החודשי של לקוח: עוקבים, חשיפה, צפיות, מעורבות, קליקים, תובנות ומה עושים בחודש הבא", parameters: params({ client: { type: "string" }, month: { type: "string", description: "YYYY-MM" } }) },
  { name: "get_ideas", description: "רעיונות להשראה ודגשים לחודש של לקוח", parameters: params({ client: { type: "string" }, month: { ...nullableStr, description: "YYYY-MM או null לחודש הנוכחי" } }) },
].map((t) => ({ type: "function" as const, strict: true, ...t }));

type Args = Record<string, string | null>;

const datesBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`) && out.length < 62; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

export function makeTools(supabase: SupabaseClient, ctx: AppContext) {
  const isStaff = ctx.role !== "client";
  const name = (id: string) => ctx.clients.find((c) => c.id === id)?.name ?? id;
  // "פיצה" → ל׳פיצהלה. לקוח שהמשתמש לא רואה פשוט לא נמצא
  const resolve = (q: string | null): string[] | { error: string } => {
    if (!q) return ctx.clients.map((c) => c.id);
    const norm = (s: string) => s.replace(/[׳'"`\s-]/g, "").toLowerCase();
    const hit = ctx.clients.filter((c) => c.id === q || norm(c.name).includes(norm(q)) || norm(q).includes(norm(c.name)));
    return hit.length ? hit.map((c) => c.id) : { error: `לא נמצא לקוח בשם "${q}". הלקוחות: ${ctx.clients.map((c) => c.name).join(", ")}` };
  };
  const team = (id: string | null) => ctx.team.find((t) => t.id === id)?.full_name ?? "";
  const today = todayIL();

  const tools: Record<string, (a: Args) => Promise<unknown>> = {
    list_clients: async () => ctx.clients.map((c) => ({ id: c.id, name: c.name, manager: team(c.manager_id), industry: (c.brand as Brand)?.industry ?? "" })),

    get_client_file: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      const c = ctx.clients.find((x) => x.id === ids[0])!;
      const b = (c.brand ?? {}) as Brand;
      return {
        client: c.name, id: c.id, story: b.story, values: b.values, audience: b.audience, tone: b.tone, dos: b.dos, donts: b.donts,
        examples: b.examples, recurring: b.recurring, fonts: b.fonts, palette: b.palette, hours: b.hours, ops: b.ops, socials: b.socials,
        booking: b.booking, contacts: b.contacts?.map(({ name, role, phone, email }) => ({ name, role, phone, email })), faq: b.faq,
      };
    },

    get_content: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      let q = supabase.from("content_items").select("client_id, date, time, type, status, title, caption, notes, stats").in("client_id", ids)
        .gte("date", a.from ?? today).lte("date", a.to ?? a.from ?? today).order("date").limit(80);
      if (a.status) q = q.eq("status", a.status);
      const { data } = await q;
      return (data ?? []).map((i) => ({ ...i, client: name(i.client_id), caption: i.caption?.slice(0, 300), notes: isStaff ? i.notes : undefined }));
    },

    get_pending: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      const weekAgo = new Date(Date.parse(today) - 7 * 864e5).toISOString().slice(0, 10);
      const [approval, review, overdue, requests] = await Promise.all([
        supabase.from("content_items").select("client_id, date, type, title").in("client_id", ids).eq("status", "client").order("date"),
        isStaff ? supabase.from("content_items").select("client_id, date, type, title").in("client_id", ids).eq("status", "review").order("date") : Promise.resolve({ data: [] }),
        isStaff ? supabase.from("content_items").select("client_id, date, type, title, status").in("client_id", ids).lt("date", today).gte("date", weekAgo).neq("status", "live") : Promise.resolve({ data: [] }),
        supabase.from("messages").select("client_id, kind, body, status, created_at").in("client_id", ids).in("status", ["new", "in_progress"]).order("created_at"),
      ]);
      const tag = (rows: { client_id: string }[] | null) => (rows ?? []).map((r) => ({ ...r, client: name(r.client_id) }));
      return { waiting_for_client_approval: tag(approval.data), waiting_for_studio_review: tag(review.data), not_marked_live: tag(overdue.data), open_requests: tag(requests.data) };
    },

    get_requests: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      let q = supabase.from("messages").select("client_id, kind, body, status, replies, created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(30);
      if (a.status) q = q.eq("status", a.status);
      const { data } = await q;
      return (data ?? []).map((m) => ({ ...m, client: name(m.client_id), replies: (m.replies as { text: string }[]).map((r) => r.text) }));
    },

    get_schedule: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      const from = a.from ?? today, to = a.to ?? from;
      const [meetings, team, events, recurring, oneOff] = await Promise.all([
        supabase.from("meetings").select("client_id, starts_at, kind, location, summary").in("client_id", ids).gte("starts_at", israelToUTC(from, "00:00")).lte("starts_at", israelToUTC(to, "23:59")).order("starts_at"),
        isStaff ? supabase.from("team_meetings").select("starts_at, location, topics").gte("starts_at", israelToUTC(from, "00:00")).lte("starts_at", israelToUTC(to, "23:59")) : Promise.resolve({ data: [] }),
        supabase.from("client_events").select("client_id, date, title, description, needs_material").in("client_id", ids).gte("date", from).lte("date", to),
        supabase.from("recurring_stories").select("client_id, title, weekdays").in("client_id", ids),
        supabase.from("one_off_stories").select("client_id, date, title").in("client_id", ids).gte("date", from).lte("date", to),
      ]);
      return {
        client_meetings: (meetings.data ?? []).map((m) => ({ ...m, client: name(m.client_id) })),
        team_meetings: team.data ?? [],
        events: (events.data ?? []).map((e) => ({ ...e, client: name(e.client_id) })),
        // סטוריז לפי תאריך: קבועים לפי היום בשבוע + חד-פעמיים
        stories_by_date: datesBetween(from, to).map((d) => ({
          date: d,
          stories: [
            ...(recurring.data ?? []).filter((r) => (r.weekdays as number[]).includes(new Date(`${d}T12:00:00Z`).getUTCDay())).map((r) => `${name(r.client_id)}: ${r.title}`),
            ...(oneOff.data ?? []).filter((o) => o.date === d).map((o) => `${name(o.client_id)}: ${o.title}`),
          ],
        })).filter((x) => x.stories.length),
      };
    },

    get_report: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      const month = `${(a.month ?? today).slice(0, 7)}-01`;
      const [metrics, report, posts] = await Promise.all([
        supabase.from("metrics").select("platform, month, followers, unfollows, reach, views, interactions, profile_visits, link_clicks").eq("client_id", ids[0]).lte("month", month).order("month", { ascending: false }).limit(6),
        supabase.from("monthly_reports").select("business, insights, next_steps, published_at").eq("client_id", ids[0]).eq("month", month).maybeSingle(),
        supabase.from("content_items").select("date, type, title, stats").eq("client_id", ids[0]).eq("status", "live").gte("date", monthRange(month)[0]).lte("date", monthRange(month)[1]),
      ]);
      return { client: name(ids[0]), month, metrics: metrics.data, report: report.data, live_posts: posts.data };
    },

    get_ideas: async (a) => {
      const ids = resolve(a.client);
      if ("error" in ids) return ids;
      const month = `${(a.month ?? today).slice(0, 7)}-01`;
      const [ideas, focus] = await Promise.all([
        isStaff ? supabase.from("ideas").select("title, note, url, used, source").eq("client_id", ids[0]).eq("month", month) : Promise.resolve({ data: [] }),
        supabase.from("monthly_focus").select("text, done, kind").eq("client_id", ids[0]).eq("month", month),
      ]);
      return { client: name(ids[0]), month, ideas: ideas.data, focus: focus.data };
    },
  };
  return tools;
}
