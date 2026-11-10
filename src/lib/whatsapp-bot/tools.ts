import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { AppContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { TYPE_LABEL, STATUS_LABEL, type ContentStatus, type ContentType } from "@/lib/types";

// פעולות כתיבה של הבוט. רצות בחיבור של המשתמש (RLS), וכל פעולה נרשמת ביומן כדי שאפשר יהיה לבטל

const str = { type: "string" } as const;
const nullableStr = { type: ["string", "null"] } as const;
const params = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties: props, required: Object.keys(props) });
const CLIENT = { type: "string", description: "שם הלקוח (או חלק ממנו)" };
const DATE = { type: "string", description: "YYYY-MM-DD" };
const ATTACH = { type: "boolean", description: "לצרף את התמונות/הסרטונים שנשלחו בשיחה ועוד לא שויכו" };
const STATUS = { type: ["string", "null"], enum: ["work", "client", "ok", "live", null], description: "work=בעבודה, client=לאישור הלקוח (הלקוח מקבל התראה), ok=מאושר, live=עלה" };

export const WRITE_DEFS = [
  { name: "add_content", description: "הוספת פוסט/ריל/טיקטוק לגאנט (סטטוס: בעבודה)", parameters: params({
    client: CLIENT, date: DATE, time: { ...nullableStr, description: "HH:MM או null" },
    type: { type: "string", enum: ["post", "reel", "tiktok"], description: "tiktok לטיקטוק; reel לכל סרטון באינסטגרם; אחרת post" },
    title: { ...str, description: "נושא קצר" }, caption: { ...nullableStr, description: "הטקסט שיעלה עם הפוסט, אם נאמר" },
    notes: { ...nullableStr, description: "הערות פנימיות" }, attach_media: ATTACH,
  }) },
  { name: "add_story", description: "הוספת סטורי חד-פעמי", parameters: params({ client: CLIENT, date: DATE, title: str, attach_media: ATTACH }) },
  { name: "add_event", description: "הוספת אירוע של הלקוח ללוח (מבצע, השקה, יום מיוחד)", parameters: params({ client: CLIENT, date: DATE, title: str }) },
  { name: "add_highlight", description: "הוספת דגש לחודש (נושא שחשוב להעלות באותו חודש)", parameters: params({ client: CLIENT, month: { ...str, description: "YYYY-MM" }, text: str }) },
  { name: "update_content", description: "שינוי פוסט/ריל/טיקטוק קיים: תאריך, שעה, סטטוס, טקסט, הערה או צירוף קבצים. מאתרים לפי לקוח + תאריך (+ חלק מהנושא)", parameters: params({
    client: CLIENT, date: { ...str, description: "התאריך הנוכחי של הפריט, YYYY-MM-DD" }, title_hint: { ...nullableStr, description: "חלק מהנושא, אם יש כמה באותו יום" },
    new_date: nullableStr, new_time: nullableStr, new_status: STATUS, new_caption: nullableStr, add_note: nullableStr, attach_media: ATTACH,
  }) },
  { name: "undo_last", description: "ביטול הפעולה האחרונה שהבוט עשה (כשכותבים 'בטל' / 'טעות')", parameters: params({}) },
].map((t) => ({ type: "function" as const, strict: true, ...t }));

type Args = Record<string, string | boolean | null>;
type Logged = { table: string; id: string; op: "insert" | "update"; before?: Record<string, unknown>; files?: string[] };
type MediaEntry = { path: string; thumb: string | null; kind: "image" | "video" };

export function makeWriteTools(supabase: SupabaseClient, ctx: AppContext, phone: string) {
  const admin = createAdminClient();
  const norm = (s: string) => s.replace(/[׳'"`\s-]/g, "").toLowerCase();
  // לקוח אחד בדיוק – אחרת מבקשים הבהרה
  const client = (q: unknown) => {
    const s = String(q ?? "");
    const hit = ctx.clients.filter((c) => c.id === s || (s && (norm(c.name).includes(norm(s)) || norm(s).includes(norm(c.name)))));
    if (hit.length === 1) return hit[0];
    return { error: hit.length ? `יש כמה לקוחות שמתאימים ל"${s}": ${hit.map((c) => c.name).join(", ")}` : `לא נמצא לקוח "${s}". הלקוחות: ${ctx.clients.map((c) => c.name).join(", ")}` };
  };
  const validDate = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));
  const validTime = (t: unknown) => t == null || (typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  const log = (content: string, data: Logged) => admin.from("whatsapp_log").insert({ phone, role: "action", content, data });

  // הקבצים שנשלחו בשעה האחרונה ועוד לא שויכו עוברים לתיקייה של הלקוח
  async function takeMedia(studioId: string, clientId: string): Promise<MediaEntry[]> {
    const { data } = await admin.from("whatsapp_log").select("id, data").eq("phone", phone).eq("role", "media")
      .gte("created_at", new Date(Date.now() - 3600e3).toISOString()).order("id");
    const out: MediaEntry[] = [];
    for (const row of data ?? []) {
      const d = row.data as { path: string; thumb: string | null; kind: "image" | "video"; ext: string; used?: boolean };
      if (d.used) continue;
      const folder = `${studioId}/${clientId}/${randomUUID()}`;
      const path = `${folder}/original.${d.ext}`;
      const { error } = await admin.storage.from("media").move(d.path, path);
      if (error) { console.error("whatsapp media move", error.message); continue; }
      let thumb: string | null = null;
      if (d.thumb && !(await admin.storage.from("media").move(d.thumb, `${folder}/thumb.jpg`)).error) thumb = `${folder}/thumb.jpg`;
      out.push({ path, thumb, kind: d.kind });
      await admin.from("whatsapp_log").update({ data: { ...d, used: true } }).eq("id", row.id);
    }
    return out;
  }
  const files = (m: MediaEntry[]) => m.flatMap((x) => [x.path, x.thumb]).filter(Boolean) as string[];
  const mediaNote = (m: MediaEntry[]) => (m.length ? ` · ${m.length} ${m.length === 1 ? "קובץ צורף" : "קבצים צורפו"}` : "");

  const tools: Record<string, (a: Args) => Promise<unknown>> = {
    add_content: async (a) => {
      const c = client(a.client);
      if ("error" in c) return c;
      if (!validDate(a.date) || !validTime(a.time)) return { error: "תאריך או שעה לא תקינים" };
      const media = a.attach_media ? await takeMedia(c.studio_id, c.id) : [];
      const type = (["post", "reel", "tiktok"].includes(String(a.type)) ? a.type : "post") as ContentType;
      const { data, error } = await supabase.from("content_items").insert({
        client_id: c.id, date: a.date, time: a.time || null, type: type === "post" && media.some((m) => m.kind === "video") ? "reel" : type,
        status: "work", title: String(a.title || "ללא נושא").slice(0, 120), caption: String(a.caption ?? ""), notes: String(a.notes ?? ""),
        media, thumb_path: media[0]?.thumb ?? null, created_by: ctx.userId,
      }).select("id, type").single();
      if (error) return { error: error.message };
      await log(`${TYPE_LABEL[data.type as ContentType]} ל${c.name}`, { table: "content_items", id: data.id, op: "insert", files: files(media) });
      return { ok: true, saved: `${TYPE_LABEL[data.type as ContentType]} · ${c.name} · ${a.date}${a.time ? ` ${a.time}` : ""} · "${a.title}"${mediaNote(media)}`, link: `/c/${c.id}/gantt` };
    },

    add_story: async (a) => {
      const c = client(a.client);
      if ("error" in c) return c;
      if (!validDate(a.date)) return { error: "תאריך לא תקין" };
      const media = a.attach_media ? await takeMedia(c.studio_id, c.id) : [];
      const { data, error } = await supabase.from("one_off_stories").insert({ client_id: c.id, date: a.date, title: String(a.title).slice(0, 120), media }).select("id").single();
      if (error) return { error: error.message };
      await log(`סטורי ל${c.name}`, { table: "one_off_stories", id: data.id, op: "insert", files: files(media) });
      return { ok: true, saved: `סטורי · ${c.name} · ${a.date} · "${a.title}"${mediaNote(media)}` };
    },

    add_event: async (a) => {
      const c = client(a.client);
      if ("error" in c) return c;
      if (!validDate(a.date)) return { error: "תאריך לא תקין" };
      const { data, error } = await supabase.from("client_events").insert({ client_id: c.id, date: a.date, title: String(a.title).slice(0, 120), created_by: ctx.userId }).select("id").single();
      if (error) return { error: error.message };
      await log(`אירוע ל${c.name}`, { table: "client_events", id: data.id, op: "insert" });
      return { ok: true, saved: `אירוע · ${c.name} · ${a.date} · "${a.title}"` };
    },

    add_highlight: async (a) => {
      const c = client(a.client);
      if ("error" in c) return c;
      if (!/^\d{4}-\d{2}$/.test(String(a.month))) return { error: "חודש לא תקין" };
      const { data, error } = await supabase.from("monthly_focus").insert({ client_id: c.id, month: `${a.month}-01`, text: String(a.text).slice(0, 300), kind: "content", url: "", position: 100 }).select("id").single();
      if (error) return { error: error.message };
      await log(`דגש ל${c.name}`, { table: "monthly_focus", id: data.id, op: "insert" });
      return { ok: true, saved: `דגש לחודש · ${c.name} · ${a.month} · "${a.text}"` };
    },

    update_content: async (a) => {
      const c = client(a.client);
      if ("error" in c) return c;
      if (!validDate(a.date) || (a.new_date && !validDate(a.new_date)) || !validTime(a.new_time)) return { error: "תאריך או שעה לא תקינים" };
      const { data: rows } = await supabase.from("content_items").select("id, date, time, type, status, title, caption, notes, media, thumb_path").eq("client_id", c.id).eq("date", a.date);
      const hint = a.title_hint ? norm(String(a.title_hint)) : "";
      const hits = (rows ?? []).filter((r) => !hint || norm(r.title).includes(hint) || norm(r.caption).includes(hint));
      if (hits.length !== 1) return { error: hits.length ? "יש כמה פריטים באותו יום – צריך חלק מהנושא" : `אין פוסט ל${c.name} ב-${a.date}`, items: (rows ?? []).map((r) => ({ type: r.type, title: r.title })) };
      const it = hits[0];
      const media = a.attach_media ? await takeMedia(c.studio_id, c.id) : [];
      const patch: Record<string, unknown> = {};
      if (a.new_date) patch.date = a.new_date;
      if (a.new_time !== null && a.new_time !== undefined) patch.time = a.new_time || null;
      if (a.new_status) patch.status = a.new_status as ContentStatus;
      if (a.new_caption !== null && a.new_caption !== undefined) patch.caption = a.new_caption;
      if (a.add_note) patch.notes = [it.notes, a.add_note].filter(Boolean).join("\n");
      if (media.length) { patch.media = [...(it.media ?? []), ...media]; if (!it.thumb_path) patch.thumb_path = media[0].thumb; }
      if (!Object.keys(patch).length) return { error: "לא נאמר מה לשנות" };
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, it[k as keyof typeof it]]));
      const { error } = await supabase.from("content_items").update(patch).eq("id", it.id);
      if (error) return { error: error.message };
      await log(`עדכון "${it.title}"`, { table: "content_items", id: it.id, op: "update", before, files: files(media) });
      const what = [patch.date && `תאריך ${patch.date}`, "time" in patch && `שעה ${patch.time ?? "בלי"}`, patch.status && `סטטוס ${STATUS_LABEL[patch.status as ContentStatus]}`,
        "caption" in patch && "טקסט חדש", a.add_note && "הערה", media.length && `${media.length} קבצים`].filter(Boolean).join(", ");
      return { ok: true, saved: `עודכן "${it.title}" (${c.name}): ${what}`, client_notified: patch.status === "client" };
    },

    undo_last: async () => {
      const { data } = await admin.from("whatsapp_log").select("id, content, data").eq("phone", phone).eq("role", "action")
        .gte("created_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("id", { ascending: false }).limit(1);
      const row = data?.[0];
      if (!row) return { error: "אין פעולה אחרונה לבטל (רק מה-6 שעות האחרונות)" };
      const d = row.data as Logged & { undone?: boolean };
      if (d.undone) return { error: "הפעולה האחרונה כבר בוטלה" };
      const res = d.op === "insert"
        ? await supabase.from(d.table).delete().eq("id", d.id)
        : await supabase.from(d.table).update(d.before ?? {}).eq("id", d.id);
      if (res.error) return { error: res.error.message };
      if (d.op === "insert" && d.files?.length) await admin.storage.from("media").remove(d.files);
      await admin.from("whatsapp_log").update({ data: { ...d, undone: true } }).eq("id", row.id);
      return { ok: true, undone: row.content };
    },
  };
  return tools;
}
