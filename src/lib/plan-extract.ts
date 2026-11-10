import "server-only";
import OpenAI from "openai";

// קריאת PDF או תמונות (צילום מסך / צילום של טבלה) של תכנון תוכן (טבלת דגשים, פוסטים ותכנון קדימה) → הצעה לגאנט.
// מחזיר הצעה בלבד – שום דבר לא נכנס לגאנט בלי שהמשתמש מאשר.

export type PlanPost = { date: string; time: string; type: "post" | "reel" | "tiktok"; title: string; caption: string; notes: string };
export type Plan = {
  highlights: { month: string; text: string }[];
  posts: PlanPost[];
  stories: { date: string; title: string }[];
  events: { date: string; title: string }[];
};

const str = { type: "string" } as const;
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties: props, required: Object.keys(props) });
const list = (props: Record<string, unknown>) => ({ type: "array", items: obj(props) });

const SCHEMA = obj({
  highlights: list({ month: str, text: str }),
  posts: list({ date: str, time: str, type: { type: "string", enum: ["post", "reel", "tiktok"] }, title: str, caption: str, notes: str }),
  stories: list({ date: str, title: str }),
  events: list({ date: str, title: str }),
});

const prompt = (today: string) => `זה מסמך תכנון תוכן (PDF, או תמונה אחת או יותר של אותה טבלה) של לקוח של סטודיו לניהול סושיאל מדיה – בדרך כלל טבלה של דגשים לחודש, פוסטים ותכנון קדימה.
חלץ ממנו את התכנון לגאנט, בעברית, בדיוק כפי שכתוב. אל תמציא פריטים ואל תשלים תאריכים שלא מופיעים.
התאריך היום: ${today}. תאריך בלי שנה – השנה שבה התאריך הקרוב ביותר מהיום והלאה (תכנון הוא קדימה). אם במסמך כתוב חודש/שנה בכותרת – השתמש בהם.

highlights – דגשים לחודש: month בפורמט YYYY-MM, text קצר. כל דגש בפריט נפרד (רשימה מופרדת בפסיקים, נקודה-פסיק או שורות = כמה דגשים). דגש, נושא או קמפיין לחודש בלי יום מדויק נכנס לכאן.
posts – כל פוסט, ריל או טיקטוק שיש לו יום מדויק: date בפורמט YYYY-MM-DD; time בפורמט HH:MM אם כתובה שעה, אחרת "";
  type: tiktok לטיקטוק; reel לכל סרטון או ריל באינסטגרם (גם אם כתוב רק "סרטון" או "וידאו"); post לתמונה, קרוסלה או פוסט;
  title – נושא הפוסט בכמה מילים; caption – טקסט הפוסט/הכיתוב אם כתוב, אחרת ""; notes – הערות הפקה (מה לצלם, רפרנס, מי אחראי), אחרת "".
  שורה בטבלה שמופיעה גם באינסטגרם וגם בטיקטוק – שני פריטים נפרדים.
stories – סטורי עם יום מדויק: date ו-title.
events – אירוע, חג, השקה או מועד חשוב של העסק עם יום מדויק: date ו-title. אל תכלול חגים כלליים שלא קשורים לעסק.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const valid = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;

export type PlanFile = { data: Buffer; mime: string };

export async function extractPlan(files: PlanFile[], today: string): Promise<Plan> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey: key });
  const pdfs = files.filter((f) => f.mime === "application/pdf");
  const images = files.filter((f) => f.mime !== "application/pdf");
  const parts: OpenAI.Responses.ResponseInputContent[] = pdfs.map((f) => ({ type: "input_file", filename: "plan.pdf", file_data: `data:application/pdf;base64,${f.data.toString("base64")}` }));
  // תמונות: קודם מעתיקים את הטבלה לטקסט (מודל חזק בקריאת עברית מתמונה), ואז מחלצים ממנו כמו מ-PDF
  if (images.length) {
    const read = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5.4",
      input: [{ role: "user", content: [
        ...images.map((f) => ({ type: "input_image" as const, detail: "high" as const, image_url: `data:${f.mime};base64,${f.data.toString("base64")}` })),
        { type: "input_text", text: "העתק את כל הטקסט שבתמונות בדיוק כפי שהוא, בעברית, בלי לפרש ובלי לסכם. כותרות ושורות טקסט – כשורות. טבלה – כטבלת Markdown עם כל העמודות, שורה לכל שורה בטבלה, תא ריק נשאר ריק. כמה תמונות – לפי הסדר." },
      ] }],
    });
    parts.push({ type: "input_text", text: `הטקסט מתוך התמונות:\n\n${read.output_text}` });
  }
  const response = await client.responses.create({
    model: process.env.OPENAI_EXTRACT_MODEL?.trim() || "gpt-5.4-mini",
    input: [{ role: "user", content: [...parts, { type: "input_text", text: prompt(today) }] }],
    text: { format: { type: "json_schema", name: "content_plan", strict: true, schema: SCHEMA } },
  });
  const raw = JSON.parse(response.output_text) as Plan;
  const t = (s: string, n: number) => s.trim().slice(0, n);
  return {
    highlights: raw.highlights.filter((h) => /^\d{4}-\d{2}$/.test(h.month) && h.text.trim()).map((h) => ({ month: h.month, text: t(h.text, 200) })),
    posts: raw.posts.filter((x) => valid(x.date) && (x.title.trim() || x.caption.trim())).map((x) => ({
      date: x.date, time: /^\d{2}:\d{2}$/.test(x.time) ? x.time : "", type: x.type,
      title: t(x.title || x.caption, 120), caption: x.caption.trim(), notes: x.notes.trim(),
    })),
    stories: raw.stories.filter((x) => valid(x.date) && x.title.trim()).map((x) => ({ date: x.date, title: t(x.title, 120) })),
    events: raw.events.filter((x) => valid(x.date) && x.title.trim()).map((x) => ({ date: x.date, title: t(x.title, 120) })),
  };
}
