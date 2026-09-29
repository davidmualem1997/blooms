// קישורי BLOOMS: סוגי קישורים, ונרמול היעד (טלפון → tel:, וואטסאפ → wa.me)
export type LinkKind = "reservation" | "menu" | "waze" | "whatsapp" | "phone" | "order" | "site" | "other";

export const LINK_KINDS: { k: LinkKind; l: string; report: string }[] = [
  { k: "reservation", l: "הזמנת מקום", report: "כניסות להזמנת מקום" },
  { k: "menu", l: "תפריט", report: "קליקים לתפריט" },
  { k: "waze", l: "ניווט", report: "קליקים לניווט" },
  { k: "whatsapp", l: "וואטסאפ", report: "פניות בוואטסאפ" },
  { k: "phone", l: "שיחה", report: "לחיצות לשיחה" },
  { k: "order", l: "הזמנה אונליין", report: "כניסות להזמנה אונליין" },
  { k: "site", l: "אתר", report: "כניסות לאתר" },
  { k: "other", l: "אחר", report: "קליקים לקישורים אחרים" },
];

const digits = (s: string) => s.replace(/[^\d+]/g, "");
// 050-1234567 → 972501234567
const intl = (s: string) => { const d = digits(s).replace(/^\+/, ""); return d.startsWith("0") ? `972${d.slice(1)}` : d; };

export function normalizeTarget(kind: LinkKind, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === "phone") return /^tel:/.test(v) ? v : digits(v).length >= 9 ? `tel:+${intl(v)}` : null;
  if (kind === "whatsapp" && !/^https?:/i.test(v)) return digits(v).length >= 9 ? `https://wa.me/${intl(v)}` : null;
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try { const u = new URL(url); return u.protocol.startsWith("http") && u.hostname.includes(".") ? u.href : null; } catch { return null; }
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
