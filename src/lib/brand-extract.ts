import "server-only";
import OpenAI from "openai";
import type { Brand } from "@/lib/types";

// קריאת PDF של לקוח (תיק מותג, אפיון, בריף) ומילוי תיק הלקוח.
// מחזיר הצעה בלבד – שום דבר לא נשמר בלי שהמשתמש מאשר.
// סיסמאות ופרטי התחברות לא נשמרים לעולם: לא מבקשים אותם מהמודל, ומסננים אם הופיעו בכל זאת.

export type ExtractedBrand = Required<Pick<Brand,
  "story" | "values" | "audience" | "tone" | "dos" | "donts" | "examples" | "recurring" | "fonts" | "ops" | "hours" | "industry">> & {
  socials: NonNullable<Brand["socials"]>;
  booking: NonNullable<Brand["booking"]>;
  contacts: NonNullable<Brand["contacts"]>;
  palette: NonNullable<Brand["palette"]>;
  faq: NonNullable<Brand["faq"]>;
};

const str = { type: "string" } as const;
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties: props, required: Object.keys(props) });

const SCHEMA = obj({
  story: str, values: str, audience: str, tone: str, dos: str, donts: str, examples: str, recurring: str, fonts: str, ops: str, hours: str,
  industry: { type: "string", enum: ["", "food", "retail", "beauty", "fashion", "fitness", "other"] },
  socials: obj({ instagram: str, tiktok: str, facebook: str, website: str }),
  booking: obj({ reserve_url: str, reserve_phone: str, menu_url: str, waze_url: str, google_url: str }),
  contacts: { type: "array", items: obj({ name: str, role: str, phone: str, email: str }) },
  palette: { type: "array", items: obj({ hex: str, name: str }) },
  faq: { type: "array", items: obj({ q: str, a: str }) },
});

const PROMPT = `זה מסמך של לקוח של סטודיו לניהול סושיאל מדיה (תיק מותג, אפיון, בריף או מצגת).
חלץ ממנו את המידע לתיק הלקוח, בעברית, בניסוח נקי וקצר. שדה שאין עליו מידע במסמך – השאר ריק ("" או רשימה ריקה). אל תמציא כלום.

story – סיפור העסק: מי הם, איך התחילו, מה מייחד אותם (פסקה או שתיים)
values – ערכי המותג
audience – קהל היעד
tone – טון ושפה בתקשורת
dos – מה כן לעשות בתוכן (שורה לכל כלל)
donts – מה לא לעשות בתוכן (שורה לכל כלל)
examples – דוגמאות לתכנים, כיתובים או סלוגנים
recurring – תכנים או פינות קבועים
fonts – פונטים
ops – מידע תפעולי: כתובת, חניה, משלוחים, מבצעים קבועים, נהלים
hours – שעות פתיחה
industry – תחום: food (מסעדה/בית קפה/בר), retail (חנות), beauty (יופי/טיפוח), fashion (אופנה), fitness (כושר), other
socials – קישורים לאינסטגרם, טיקטוק, פייסבוק ואתר (כתובת מלאה או שם משתמש)
booking – קישור להזמנת מקום, טלפון להזמנות, קישור לתפריט, קישור ל-Waze, קישור לגוגל
contacts – אנשי קשר: שם, תפקיד, טלפון, מייל
palette – צבעי המותג: hex (למשל #C8553D) ושם הצבע
faq – שאלות נפוצות של לקוחות ותשובות

חשוב מאוד: אסור לכלול סיסמאות, קודים, שמות משתמש להתחברות או כל פרט גישה לחשבון – גם אם הם מופיעים במסמך.`;

// הגנה כפולה: שורה שנראית כמו פרטי התחברות נמחקת
const SECRET = /(סיסמ|password|passwd|\bpass\b|קוד\s*(גישה|כניסה|אימות)|2fa|otp)/i;
const clean = (s: string) => s.split("\n").filter((l) => !SECRET.test(l)).join("\n").trim();

export async function extractBrandFromPdf(pdf: Buffer, filename: string): Promise<ExtractedBrand> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey: key });
  const response = await client.responses.create({
    model: process.env.OPENAI_EXTRACT_MODEL?.trim() || "gpt-5.4-mini",
    input: [{
      role: "user",
      content: [
        { type: "input_file", filename, file_data: `data:application/pdf;base64,${pdf.toString("base64")}` },
        { type: "input_text", text: PROMPT },
      ],
    }],
    text: { format: { type: "json_schema", name: "client_file", strict: true, schema: SCHEMA } },
  });
  const raw = JSON.parse(response.output_text) as ExtractedBrand;

  // ניקוי: טקסטים, סינון פרטי התחברות, צבעים תקינים בלבד, בלי פריטים ריקים
  const out = { ...raw };
  for (const k of ["story", "values", "audience", "tone", "dos", "donts", "examples", "recurring", "fonts", "ops", "hours"] as const) out[k] = clean(raw[k] ?? "");
  out.contacts = (raw.contacts ?? []).filter((c) => c.name || c.phone || c.email);
  out.palette = (raw.palette ?? []).map((p) => ({ ...p, hex: p.hex.trim().toUpperCase() })).filter((p) => /^#[0-9A-F]{6}$/.test(p.hex));
  out.faq = (raw.faq ?? []).filter((f) => f.q && f.a && !SECRET.test(f.q + f.a));
  return out;
}
