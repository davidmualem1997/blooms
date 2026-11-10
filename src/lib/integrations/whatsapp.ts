import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API: שליחת הודעות ואימות שההודעות שמגיעות באמת ממטא
const VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v24.0";

export type WaIncoming = { from: string; name: string; id: string; type: string; text: string; groupId?: string; phoneId?: string };

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
      const text = m.type === "text" ? String((m.text as { body?: string })?.body ?? "")
        : String((m[m.type as string] as { caption?: string })?.caption ?? "");
      out.push({
        from, id: String(m.id ?? ""), type: String(m.type ?? ""), text,
        name: contacts.find((x) => x.wa_id === from)?.profile?.name ?? "",
        groupId: (m.group_id as string | undefined) ?? undefined, phoneId,
      });
    }
  }
  return out;
}

// עונים מאותו מספר שההודעה הגיעה אליו (phoneId), ואם אין – מהמספר שבהגדרות
export async function sendText(to: string, text: string, fromPhoneId?: string) {
  const phoneId = fromPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!phoneId || !token) throw new Error("WhatsApp is not configured");
  const res = await fetch(`https://graph.facebook.com/${VERSION()}/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
}
