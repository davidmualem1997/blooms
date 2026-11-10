import { after, NextResponse, type NextRequest } from "next/server";
import { parseIncoming, sendText, validSignature } from "@/lib/integrations/whatsapp";
import { handleIncoming } from "@/lib/whatsapp-bot/bot";

// Webhook של וואטסאפ: מאמתים שההודעה ממטא, עונים מיד, והבוט עובד ברקע
export const maxDuration = 120;

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
    console.error("whatsapp bad signature");
    return new NextResponse("bad signature", { status: 401 });
  }
  const messages = parseIncoming(JSON.parse(raw));
  // עונים למטא מיד, והטיפול ממשיך ברקע (אחרת מטא שולחת שוב)
  after(async () => {
    for (const m of messages) {
      if (m.groupId) continue; // קבוצות – בהמשך
      try {
        await handleIncoming(m);
      } catch (e) {
        console.error("whatsapp bot", (e as Error).message);
        await sendText(m.from, "משהו השתבש אצלי. נסו שוב בעוד רגע.", m.phoneId).catch(() => {});
      }
    }
  });
  return NextResponse.json({ ok: true });
}
