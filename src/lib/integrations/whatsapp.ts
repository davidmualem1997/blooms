import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API: שליחת הודעות, הורדת קבצים ואימות שההודעות שמגיעות באמת ממטא
const VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v24.0";
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`;
const token = () => {
  const t = process.env.WHATSAPP_TOKEN?.trim();
  if (!t) throw new Error("WhatsApp is not configured");
  return t;
};

export type WaIncoming = {
  from: string; name: string; id: string; type: string; text: string; groupId?: string; phoneId?: string;
  media?: { id: string; mime: string }; // תמונה / סרטון / קובץ / הקלטה
};

// החתימה של מטא: HMAC-SHA256 של גוף הבקשה עם ה-App Secret
export function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// מוציא את ההודעות מה-webhook (מתעלם מעדכוני סטטוס: נשלח/נקרא)
export function parseIncoming(body: unknown): WaIncoming[] {
  const out: WaIncoming[] = [];
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) {
    const v = c.value ?? {};
    const phoneId = (v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id;
    const contacts = (v.contacts ?? []) as { wa_id: string; profile?: { name?: string } }[];
    for (const m of (v.messages ?? []) as Record<string, unknown>[]) {
      const from = String(m.from ?? "");
      const type = String(m.type ?? "");
      const part = m[type] as { body?: string; caption?: string; id?: string; mime_type?: string } | undefined;
      out.push({
        from, id: String(m.id ?? ""), type, phoneId,
        text: type === "text" ? String(part?.body ?? "") : String(part?.caption ?? ""),
        media: ["image", "video", "document", "audio"].includes(type) && part?.id ? { id: part.id, mime: part.mime_type ?? "" } : undefined,
        name: contacts.find((x) => x.wa_id === from)?.profile?.name ?? "",
        groupId: (m.group_id as string | undefined) ?? undefined,
      });
    }
  }
  return out;
}

async function post(phoneId: string | undefined, body: Record<string, unknown>) {
  const id = phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id) throw new Error("WhatsApp is not configured");
  const res = await fetch(`${GRAPH()}/${id}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${String(body.type ?? body.status)} failed: ${res.status} ${await res.text()}`);
}

// עונים מאותו מספר שההודעה הגיעה אליו (phoneId), ואם אין – מהמספר שבהגדרות
export async function sendText(to: string, text: string, fromPhoneId?: string) {
  await post(fromPhoneId, { to, type: "text", text: { body: text.slice(0, 4000) } });
}

// "נקרא" + "מקליד…" בזמן שהבוט חושב
export async function markReadTyping(messageId: string, fromPhoneId?: string) {
  await post(fromPhoneId, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

export async function react(to: string, messageId: string, emoji: string, fromPhoneId?: string) {
  await post(fromPhoneId, { to, type: "reaction", reaction: { message_id: messageId, emoji } });
}

// קובץ שנשלח לבוט: קודם כתובת זמנית ממטא, ואז ההורדה עצמה (עם אותו טוקן)
export async function downloadMedia(mediaId: string): Promise<{ data: Buffer; mime: string }> {
  const meta = await fetch(`${GRAPH()}/${mediaId}`, { headers: { authorization: `Bearer ${token()}` } });
  if (!meta.ok) throw new Error(`media info ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: { authorization: `Bearer ${token()}` } });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { data: Buffer.from(await file.arrayBuffer()), mime: mime_type };
}

// המספר שמוצג ללקוחות (למשל 15551597988) – לקישור wa.me מהאפליקציה
export async function displayNumber(): Promise<string | null> {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id || !process.env.WHATSAPP_TOKEN?.trim()) return null;
  const res = await fetch(`${GRAPH()}/${id}?fields=display_phone_number`, { headers: { authorization: `Bearer ${token()}` }, next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const { display_phone_number } = (await res.json()) as { display_phone_number?: string };
  return display_phone_number?.replace(/\D/g, "") || null;
}
