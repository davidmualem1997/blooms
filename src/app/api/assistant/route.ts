import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { GUIDE } from "@/lib/assistant/guide";
import { TOOL_DEFS, makeTools } from "@/lib/assistant/tools";
import { getContext } from "@/lib/context";
import { israelToUTC, longToday, todayIL } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// עוזר ה-AI: עונה על שאלות שימוש באפליקציה ועל הנתונים של המשתמש (קריאה בלבד, בהרשאות שלו)
export const maxDuration = 60;
const DAILY_LIMIT = 40;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "העוזר עוד לא מוגדר" }, { status: 503 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "צריך להתחבר" }, { status: 401 });
  const ctx = await getContext();

  const body = (await request.json().catch(() => ({}))) as { messages?: Msg[]; clientId?: string };
  const messages = (body.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages.at(-1)!.role !== "user") return NextResponse.json({ error: "אין שאלה" }, { status: 400 });

  // מגבלה יומית לכל משתמש
  const today = todayIL();
  const { count } = await supabase.from("assistant_usage").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("created_at", israelToUTC(today, "00:00"));
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: `הגעת למגבלה של ${DAILY_LIMIT} שאלות ליום. נמשיך מחר 🙂` }, { status: 429 });
  await supabase.from("assistant_usage").insert({ user_id: auth.user.id });

  const current = ctx.clients.find((c) => c.id === body.clientId);
  const roleLabel = ctx.role === "owner" ? "מנהלת הסטודיו" : ctx.role === "manager" ? "מנהל/ת לקוחות" : "לקוח/ה";
  const instructions = `את/ה העוזר של BLOOMS – אפליקציה לניהול סושיאל מדיה של סטודיו.
עונים בעברית, קצר וברור, בגובה העיניים, ופונים בלשון רבים ("אם תרצו", "לחצו") – בלי להניח מגדר. לשאלות "איך עושים" – צעדים ממוספרים קצרים. לשאלות על נתונים – קודם בודקים עם הכלים, לא מנחשים.
כשמפנים למסך – קישור Markdown עם הנתיב, למשל [לגאנט](/c/<id>/gantt). השתמש/י רק במזהי הלקוחות מהרשימה למטה.
אין לך אפשרות לבצע פעולות או לשנות נתונים – רק להסביר ולהציג מידע. אם מבקשים פעולה, מסבירים איך עושים אותה באפליקציה.
אל תספר/י על מסכים או נתונים שהתפקיד של המשתמש לא רואה. אל תמציא/י פיצ'רים שלא מופיעים במדריך.

המשתמש/ת: ${ctx.profile.full_name || "ללא שם"} · ${roleLabel}
היום: ${longToday(today)} (${today}), שעון ישראל
הלקוחות שהמשתמש/ת רואה: ${ctx.clients.map((c) => `${c.name} (id: ${c.id})`).join(", ") || "אין"}
${current ? `המסך הנוכחי שייך ללקוח: ${current.name} (id: ${current.id}). שאלה בלי שם לקוח – כנראה עליו.` : ""}

${GUIDE}`;

  const openai = new OpenAI({ apiKey: key });
  const tools = makeTools(supabase, ctx);
  const input: ResponseInputItem[] = messages.map((m) => ({ role: m.role, content: m.content }));
  try {
    for (let round = 0; round < 6; round++) {
      const response = await openai.responses.create({
        model: process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-5.4-mini",
        instructions, input, tools: TOOL_DEFS, store: false,
      });
      const calls = response.output.filter((o) => o.type === "function_call");
      if (!calls.length) {
        // רק ההודעה האחרונה, בלי שאריות של קריאות לכלים שנכתבו כטקסט
        const last = response.output.filter((o) => o.type === "message").at(-1);
        const text = last && "content" in last ? last.content.map((c) => ("text" in c ? c.text : "")).join("") : response.output_text;
        return NextResponse.json({ text: text.replace(/^\s*\{[^{}]*"(client|from|to|month|status)"[^{}]*\}\s*/, "").trim() });
      }
      input.push(...(response.output as ResponseInputItem[]));
      for (const call of calls) {
        let output: unknown;
        try { output = await tools[call.name]?.(JSON.parse(call.arguments)) ?? { error: "unknown tool" }; }
        catch (e) { output = { error: (e as Error).message }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output).slice(0, 30000) });
      }
    }
    return NextResponse.json({ text: "השאלה מסובכת מדי בשבילי כרגע – נסו לפרק אותה לשאלות קטנות." });
  } catch (e) {
    console.error("assistant", (e as Error).message);
    return NextResponse.json({ error: "העוזר לא זמין כרגע. נסו שוב." }, { status: 500 });
  }
}
