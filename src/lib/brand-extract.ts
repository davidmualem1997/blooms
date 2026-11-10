import "server-only";
import OpenAI from "openai";
import type { SiteScan } from "@/lib/site-scrape";
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

const PROMPT_PDF = `זה מסמך של לקוח של סטודיו לניהול סושיאל מדיה (תיק מותג, אפיון, בריף או מצגת).
חלץ ממנו את המידע לתיק הלקוח, בעברית, בניסוח נקי וקצר. שדה שאין עליו מידע במסמך – השאר ריק ("" או רשימה ריקה). אל תמציא כלום.
`;

const FIELDS_GUIDE = `
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

async function run(content: OpenAI.Responses.ResponseInputContent[], name: string, schema: object): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey: key });
  const response = await client.responses.create({
    model: process.env.OPENAI_EXTRACT_MODEL?.trim() || "gpt-5.4-mini",
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name, strict: true, schema: schema as Record<string, unknown> } },
  });
  return JSON.parse(response.output_text);
}

// ניקוי: טקסטים, סינון פרטי התחברות, צבעים תקינים בלבד, בלי פריטים ריקים
function tidy(raw: ExtractedBrand): ExtractedBrand {
  const out = { ...raw };
  for (const k of ["story", "values", "audience", "tone", "dos", "donts", "examples", "recurring", "fonts", "ops", "hours"] as const) out[k] = clean(raw[k] ?? "");
  out.contacts = (raw.contacts ?? []).filter((c) => c.name || c.phone || c.email);
  out.palette = (raw.palette ?? []).map((p) => ({ ...p, hex: p.hex.trim().toUpperCase() })).filter((p) => /^#[0-9A-F]{6}$/.test(p.hex));
  out.faq = (raw.faq ?? []).filter((f) => f.q && f.a && !SECRET.test(f.q + f.a));
  return out;
}

export async function extractBrandFromPdf(pdf: Buffer, filename: string): Promise<ExtractedBrand> {
  const raw = await run([
    { type: "input_file", filename, file_data: `data:application/pdf;base64,${pdf.toString("base64")}` },
    { type: "input_text", text: PROMPT_PDF + FIELDS_GUIDE },
  ], "client_file", SCHEMA);
  return tidy(raw as ExtractedBrand);
}

const PROMPT_SITE = `אלה נתונים שנסרקו מהאתר של עסק, לקוח של סטודיו לניהול סושיאל מדיה.
חלץ מהם את המידע לתיק הלקוח, בעברית, בניסוח נקי וקצר. שדה שאין עליו מידע – השאר ריק ("" או רשימה ריקה). אל תמציא כלום.
הטקסט של האתר שיווקי – נסח ממנו את סיפור העסק, הערכים, הקהל והטון כפי שהם משתקפים באתר. examples – רק סלוגנים ומשפטי מפתח שמופיעים באתר עצמו. dos, donts ו-recurring – השאר ריקים (אתר לא מגדיר כללי תוכן, ותפריט האתר אינו "תכנים קבועים").
palette – צבעי המותג: קודם כל צבעי הלוגו אם יש; אחרת 2–5 צבעים מתוך צבעי העיצוב (לפי שכיחות ו-theme-color). דלג על לבן, שחור ואפורים ניטרליים אלא אם הם באמת חלק מהמותג. תן לכל צבע שם בעברית.
fonts – שמות הפונטים מתוך רשימת הפונטים.
logo_url – הכתובת של הלוגו מתוך רשימת המועמדים בלבד (העתק אותה בדיוק). העדף תמונה עם "logo" או לוגו מוגדר לגוגל על פני אייקון האתר; תמונת השיתוף רק אם אין אחרת ונראה שהיא לוגו. אם אין – "".
socials.website – כתובת האתר.
`;

const SITE_SCHEMA = { ...SCHEMA, properties: { ...SCHEMA.properties, logo_url: str }, required: [...SCHEMA.required, "logo_url"] };

export async function extractBrandFromSite(scan: SiteScan): Promise<ExtractedBrand & { logo_url: string }> {
  const data = [
    `כתובת: ${scan.url}`,
    `כותרת: ${scan.title}`,
    `תיאור: ${scan.description}`,
    `theme-color: ${scan.themeColor || "-"}`,
    `צבעי הלוגו: ${scan.logoColors.join(", ") || "-"}`,
    `צבעי העיצוב (צבע × מספר הופעות): ${scan.colors.map((c) => `${c.hex}×${c.count}`).join(", ") || "-"}`,
    `פונטים: ${scan.fonts.join(", ") || "-"}`,
    `מועמדים ללוגו:\n${scan.logos.map((l) => `- ${l.url} (${l.why})`).join("\n") || "-"}`,
    `קישורים:\n${scan.links.join("\n") || "-"}`,
    `נתונים מובנים (JSON-LD):\n${scan.jsonLd || "-"}`,
    `טקסט האתר:\n${scan.text}`,
  ].join("\n\n");
  const raw = (await run([{ type: "input_text", text: PROMPT_SITE + FIELDS_GUIDE + "\n\n---\n\n" + data }], "client_site", SITE_SCHEMA)) as ExtractedBrand & { logo_url: string };
  const out = { ...tidy(raw), dos: "", donts: "", recurring: "" };
  const logo_url = scan.logos.some((l) => l.url === raw.logo_url) ? raw.logo_url : "";
  if (!out.socials.website) out.socials = { ...out.socials, website: scan.url };
  return { ...out, logo_url };
}
