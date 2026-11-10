import { after, NextResponse, type NextRequest } from "next/server";
import { parseIncoming, sendText, validSignature } from "@/lib/integrations/whatsapp";

// Webhook של וואטסאפ. שלב ראשון: מאשרים את החיבור ועונים "קיבלתי" – כדי לוודא שהצינור עובד
export const maxDuration = 60;

// אימות הכתובת כשמגדירים אותה אצל מטא
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.error("whatsapp bad signature", raw.length, Boolean(request.headers.get("x-hub-signature-256")));
    return new NextResponse("bad signature", { status: 401 });
  }
  const body = JSON.parse(raw);
  // זמני: בדיקה וחיבור של חשבון הוואטסאפ לאפליקציה (רק עם חתימה של ה-App Secret)
  if (body?.diag === "subscribe" && /^\d+$/.test(String(body.waba))) {
    const token = process.env.WHATSAPP_TOKEN?.trim();
    const url = `https://graph.facebook.com/v24.0/${body.waba}/subscribed_apps`;
    const before = await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json();
    const sub = await (await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } })).json();
    const after = await (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).json();
    const phone = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const cfg = phone ? await (await fetch(`https://graph.facebook.com/v24.0/${phone}?fields=webhook_configuration`, { headers: { authorization: `Bearer ${token}` } })).json() : null;
    return NextResponse.json({ before, sub, after, cfg, envPhoneMatches: phone === "1382561721615227" });
  }
  const messages = parseIncoming(body);
  // זמני, לבדיקת החיבור: רק מבנה ההודעה (שמות שדות), בלי התוכן
  const v = body?.entry?.[0]?.changes?.[0]?.value;
  if (v?.messages) console.log("whatsapp shape", JSON.stringify({ value: Object.keys(v), message: Object.keys(v.messages[0] ?? {}), contact: Object.keys(v.contacts?.[0] ?? {}) }));
  // עונים למטא מיד, והטיפול ממשיך ברקע (אחרת מטא שולחת שוב)
  after(async () => {
    for (const m of messages) {
      if (m.groupId) continue; // קבוצות – בהמשך
      try {
        await sendText(m.from, `קיבלתי ✓ ${m.text ? `"${m.text.slice(0, 200)}"` : `(${m.type})`}\nהבוט של BLOOMS בבנייה – בקרוב אדע גם לענות.`, m.phoneId);
      } catch (e) {
        // זמני: פורמט המספר בלבד (ספרות ראשונות ואחרונות), לבירור רשימת הנמענים של מספר הבדיקה
        console.error("whatsapp reply", m.phoneId === process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ? "same-phone-id" : "env-phone-id-differs", m.from.length, `${m.from.slice(0, 5)}…${m.from.slice(-2)}`, e);
      }
    }
  });
  return NextResponse.json({ ok: true });
}
