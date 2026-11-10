import "server-only";
import { randomUUID } from "node:crypto";
import OpenAI, { toFile } from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import sharp from "sharp";
import { TOOL_DEFS, makeTools } from "@/lib/assistant/tools";
import { loadContext } from "@/lib/context";
import { longToday, todayIL, WEEKDAYS } from "@/lib/dates";
import { downloadMedia, markReadTyping, react, sendText, type WaIncoming } from "@/lib/integrations/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { asUser } from "./session";
import { WRITE_DEFS, makeWriteTools } from "./tools";

// הבוט של הצוות בוואטסאפ: מכניס לגאנט מהודעות רגילות (טקסט, הקלטה, תמונה, סרטון) ועונה על שאלות
const SITE = "https://blooms-phi.vercel.app";
const DAILY_LIMIT = 150;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/3gpp": "3gp" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleIncoming(m: WaIncoming) {
  const admin = createAdminClient();
  const reply = (text: string) => sendText(m.from, text, m.phoneId);

  // מטא שולחת לפעמים את אותה הודעה פעמיים – מטפלים רק בפעם הראשונה
  const first = await admin.from("whatsapp_log").insert({ phone: m.from, wa_id: m.id, role: "user", content: m.text.slice(0, 4000), data: { type: m.type } });
  if (first.error) return; // כפילות (wa_id ייחודי)

  const { data: link } = await admin.from("whatsapp_links").select("user_id").eq("phone", m.from).maybeSingle();
  if (!link) return connect(m, reply);

  await markReadTyping(m.id, m.phoneId).catch(() => {});
  const { count } = await admin.from("whatsapp_log").select("id", { count: "exact", head: true }).eq("phone", m.from).eq("role", "user")
    .gte("created_at", new Date(Date.now() - 864e5).toISOString());
  if ((count ?? 0) > DAILY_LIMIT) return reply("הגעתם למגבלת ההודעות היומית לבוט. נמשיך מחר 🙂");

  const session = await asUser(link.user_id);
  try {
    const ctx = await loadContext(session.supabase, link.user_id, session.email);
    if (!ctx || ctx.role === "client") return reply("הבוט פתוח כרגע רק לצוות הסטודיו. בקרוב גם ללקוחות 🙂");

    // קובץ: נשמר בצד עד שיודעים לאיזה לקוח הוא שייך. בלי טקסט – רק 👍 ומחכים להוראה
    let text = m.text.trim();
    if (m.media && (m.type === "image" || m.type === "video")) {
      const ok = await stage(m, admin);
      if (!ok) return reply("לא הצלחתי לשמור את הקובץ. נסו לשלוח שוב.");
      if (!text) return void (await react(m.from, m.id, "👍", m.phoneId).catch(() => {}));
      await sleep(4000); // כמה תמונות שנשלחו יחד מגיעות כהודעות נפרדות – מחכים שכולן יישמרו
      text = `[צורף ${m.type === "video" ? "סרטון" : "תמונה"}] ${text}`;
    } else if (m.type === "audio") {
      text = await transcribe(m).catch(() => "");
      if (!text) return reply("לא הצלחתי לשמוע את ההקלטה. אפשר לכתוב?");
    } else if (m.type !== "text") {
      return reply("אני מבין טקסט, הקלטות, תמונות וסרטונים.");
    }
    if (!text) return;

    const answer = await think(text, m, ctx, session.supabase, admin);
    await admin.from("whatsapp_log").insert({ phone: m.from, role: "assistant", content: answer.slice(0, 4000) });
    await reply(answer);
  } finally {
    await session.done().catch(() => {});
  }
}

// חיבור מספר: באפליקציה (הפרופיל שלי) מקבלים קוד, ושולחים אותו לבוט
async function connect(m: WaIncoming, reply: (t: string) => Promise<void>) {
  const admin = createAdminClient();
  const code = m.text.match(/\b(\d{6})\b/)?.[1];
  if (code) {
    const { data: c } = await admin.from("whatsapp_link_codes").select("user_id, expires_at").eq("code", code).maybeSingle();
    if (c && Date.parse(c.expires_at) > Date.now()) {
      await admin.from("whatsapp_links").delete().or(`phone.eq.${m.from},user_id.eq.${c.user_id}`);
      await admin.from("whatsapp_links").insert({ phone: m.from, user_id: c.user_id });
      await admin.from("whatsapp_link_codes").delete().eq("user_id", c.user_id);
      return reply("מחובר ✓\nאפשר לכתוב לי למשל:\n• תוסיף ריל לפיצהלה ביום חמישי בשש\n• סטורי למחר לפיש גארדן (עם תמונה)\n• מה עולה השבוע?\n• מה מחכה לאישור?\nולביטול הפעולה האחרונה: *בטל*");
    }
    return reply("הקוד לא נכון או שפג תוקפו. אפשר לקבל קוד חדש באפליקציה: הפרופיל שלי ← וואטסאפ.");
  }
  return reply("המספר הזה עוד לא מחובר ל-BLOOMS.\nכדי לחבר: באפליקציה ← הפרופיל שלי ← וואטסאפ ← חיבור, ושולחים לכאן את הקוד.");
}

// תמונה/סרטון נשמרים בתיקייה זמנית (עם תמונה ממוזערת לתמונות), ונרשמים ביומן כממתינים לשיוך
async function stage(m: WaIncoming, admin: ReturnType<typeof createAdminClient>) {
  try {
    const { data, mime } = await downloadMedia(m.media!.id);
    if (data.length > 100 * 1024 * 1024) return false;
    const kind = mime.startsWith("video") ? "video" : "image";
    const ext = EXT[mime] ?? (kind === "video" ? "mp4" : "jpg");
    const base = `wa-inbox/${m.from}/${randomUUID()}`;
    const up = await admin.storage.from("media").upload(`${base}.${ext}`, data, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    let thumb: string | null = null;
    if (kind === "image") {
      const small = await sharp(data).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer().catch(() => null);
      if (small && !(await admin.storage.from("media").upload(`${base}-thumb.jpg`, small, { contentType: "image/jpeg", upsert: true })).error) thumb = `${base}-thumb.jpg`;
    }
    await admin.from("whatsapp_log").insert({ phone: m.from, role: "media", content: m.text.slice(0, 500), data: { path: `${base}.${ext}`, thumb, kind, ext } });
    return true;
  } catch (e) {
    console.error("whatsapp stage", (e as Error).message);
    return false;
  }
}

async function transcribe(m: WaIncoming) {
  const id = m.media?.id;
  if (!id) return "";
  const { data, mime } = await downloadMedia(id);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  const r = await openai.audio.transcriptions.create({
    file: await toFile(data, `voice.${mime.includes("ogg") ? "ogg" : "m4a"}`, { type: mime }),
    model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe", language: "he",
  });
  return r.text.trim();
}

async function think(text: string, m: WaIncoming, ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>, supabase: Parameters<typeof makeTools>[0], admin: ReturnType<typeof createAdminClient>) {
  const today = todayIL();
  // זיכרון קצר: השיחה מה-12 שעות האחרונות
  const { data: hist } = await admin.from("whatsapp_log").select("role, content").eq("phone", m.from).in("role", ["user", "assistant"])
    .gte("created_at", new Date(Date.now() - 12 * 3600e3).toISOString()).order("id", { ascending: false }).limit(13);
  const history = (hist ?? []).reverse().slice(0, -1).filter((h) => h.content)
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
  const { count: pending } = await admin.from("whatsapp_log").select("id", { count: "exact", head: true }).eq("phone", m.from).eq("role", "media")
    .gte("created_at", new Date(Date.now() - 3600e3).toISOString()).is("data->>used", null);
  const week = Array.from({ length: 8 }, (_, i) => { const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 864e5); return `${WEEKDAYS[d.getUTCDay()]} ${d.toISOString().slice(0, 10)}`; }).join(", ");

  const instructions = `את/ה הבוט של BLOOMS בוואטסאפ – עוזר/ת של ${ctx.profile.full_name || "הצוות"} (${ctx.role === "owner" ? "מנהלת הסטודיו" : "מנהל/ת לקוחות"}) בניהול הסושיאל של הלקוחות.
תפקידים: (1) להכניס לאפליקציה מה שמבקשים – פוסט/ריל/טיקטוק, סטורי, אירוע, דגש לחודש, שינוי תאריך/שעה/סטטוס/טקסט, צירוף תמונות וסרטונים. (2) לענות על שאלות מהנתונים (קודם בודקים בכלים, לא מנחשים).
כללים:
• כשהבקשה ברורה – מבצעים מיד, בלי לשאול "בטוח?". חסר משהו מהותי (לקוח, תאריך) – שואלים שאלה אחת קצרה. "מחר", "חמישי", "שבוע הבא" – מתרגמים לתאריך לפי הלוח למטה.
• בלי שעה – לא ממציאים שעה. בלי טקסט לפוסט – caption ריק. נושא (title) – קצר.
• סוג: טיקטוק → tiktok; סרטון/ריל לאינסטגרם → reel; אחרת post. "פוסט וטיקטוק" = שני פריטים.
• קבצים: ${pending ? `יש כרגע ${pending} קבצים שנשלחו ועוד לא שויכו – כשמוסיפים/מעדכנים פריט שהם שייכים אליו, attach_media=true.` : "אין קבצים שמחכים לשיוך."}
• שינוי סטטוס ל"לאישור הלקוח" שולח ללקוח התראה – עושים רק כשביקשו במפורש.
• אחרי פעולה: מאשרים בשורה אחת מה נשמר (סוג · לקוח · יום ותאריך · נושא), ובסוף "לביטול: בטל". כמה פעולות – שורה לכל אחת.
• "בטל" / "טעות" / "תמחק את זה" מיד אחרי פעולה → undo_last.
• עונים בעברית, קצר, בלי Markdown של קישורים. מותר *מודגש*. קישור למסך – כתובת מלאה: ${SITE}/c/<client id>/gantt
היום: ${longToday(today)} (${today}), שעון ישראל. הימים הקרובים: ${week}
הלקוחות: ${ctx.clients.map((c) => `${c.name} (id: ${c.id})`).join(", ") || "אין"}`;

  const read = makeTools(supabase, ctx);
  const write = makeWriteTools(supabase, ctx, m.from);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  const input: ResponseInputItem[] = [...history, { role: "user", content: text.slice(0, 4000) }];
  for (let round = 0; round < 8; round++) {
    const response = await openai.responses.create({
      model: process.env.OPENAI_BOT_MODEL?.trim() || process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.4-mini",
      instructions, input, tools: [...TOOL_DEFS, ...WRITE_DEFS], store: false,
    });
    const calls = response.output.filter((o) => o.type === "function_call");
    if (!calls.length) return response.output_text.trim() || "לא הבנתי – אפשר לנסח אחרת?";
    input.push(...(response.output as ResponseInputItem[]));
    for (const call of calls) {
      let output: unknown;
      try {
        const fn = write[call.name] ?? read[call.name];
        output = fn ? await fn(JSON.parse(call.arguments)) : { error: "unknown tool" };
      } catch (e) { output = { error: (e as Error).message }; }
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output).slice(0, 30000) });
    }
  }
  return "הבקשה ארוכה מדי בשבילי – אפשר לפרק אותה להודעות קצרות?";
}
