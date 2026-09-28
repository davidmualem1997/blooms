import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseISODate, toISODate, todayIL } from "@/lib/dates";

export type Trend = { title: string; what: string; how: string; platform: string; source: string };

// יום ראשון של השבוע הנוכחי (שעון ישראל) – מזהה השבוע
export function currentWeekStart(today = todayIL()) {
  const d = parseISODate(today);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toISODate(d);
}

const PROMPT = (week: string) => `את/ה עוזר/ת מחקר של סטודיו לניהול סושיאל מדיה בישראל.
השבוע מתחיל ב-${week}. חפש/י ברשת ומצא/י את שלושת הטרנדים החזקים ביותר בסושיאל מדיה בעולם בשבוע הזה
(פורמטים של רילס וטיקטוק, סאונדים, אתגרים, סגנונות עריכה, מימים) שעסקים קטנים – מסעדות, יופי, אופנה, כושר – יכולים לאמץ.
העדף/י טרנדים שדווחו בשבוע האחרון ממקורות אמינים (בלוגים של שיווק, אתרי חדשות טכנולוגיה, דוחות פלטפורמה).

החזר/י JSON בלבד, בלי טקסט לפני או אחרי, במבנה:
[{"title": "שם הטרנד בעברית", "what": "מה זה, משפט או שניים", "how": "איך עסק קטן יכול להשתמש בזה, משפט אחד", "platform": "TikTok / Instagram / שתיהן", "source": "URL של מקור אחד"}]
בדיוק 3 פריטים, הכול בעברית חוץ מה-URL.`;

// מחקר שבועי עם חיפוש ברשת. רץ פעם בשבוע (cron) ונשמר בטבלה weekly_trends
export async function generateWeeklyTrends(week = currentWeekStart()): Promise<Trend[]> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: PROMPT(week) }];
  let response: Anthropic.Beta.BetaMessage | undefined;

  // חיפוש ארוך עלול לחזור עם pause_turn – ממשיכים את אותה פנייה עד שהיא מסתיימת
  for (let i = 0; i < 4; i++) {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response || response.stop_reason === "refusal") throw new Error("trend research was declined");

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) throw new Error("no JSON in trend response");
  const items = (JSON.parse(json) as Trend[]).slice(0, 3).map((t) => ({
    title: String(t.title ?? ""), what: String(t.what ?? ""), how: String(t.how ?? ""),
    platform: String(t.platform ?? ""), source: String(t.source ?? ""),
  }));
  if (items.length === 0) throw new Error("empty trend list");

  const admin = createAdminClient();
  const { error } = await admin.from("weekly_trends").upsert({ week_start: week, items });
  if (error) throw new Error(error.message);
  return items;
}
