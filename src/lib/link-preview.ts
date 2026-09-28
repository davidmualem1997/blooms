import "server-only";
import { createClient } from "@/lib/supabase/server";

// תמונה ראשית לרעיון: לוקחים את תמונת התצוגה של הריל / הפין / הטיקטוק ושומרים עותק אצלנו
// (קישורי תמונות של אינסטגרם פגים אחרי זמן קצר, לכן לא שומרים את הקישור עצמו)
async function findImageUrl(url: string): Promise<string | null> {
  const signal = AbortSignal.timeout(8000);
  if (/tiktok\.com/.test(url)) {
    const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal });
    if (r.ok) return ((await r.json()) as { thumbnail_url?: string }).thumbnail_url ?? null;
  }
  // אינסטגרם מחזיר og:image לסורק של פייסבוק; פינטרסט – לדפדפן רגיל. מנסים את שניהם
  for (const ua of ["facebookexternalhit/1.1", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"]) {
    const r = await fetch(url, { signal, redirect: "follow", headers: { "user-agent": ua, accept: "text/html" } });
    if (!r.ok) continue;
    const html = (await r.text()).slice(0, 600_000);
    const m = html.match(/og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ?? html.match(/content=["']([^"']+)["'][^>]*og:image["']/i);
    if (m) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

export async function previewImageFor(url: string, studioId: string, clientId: string): Promise<string | null> {
  if (!url) return null;
  try {
    const img = await findImageUrl(url);
    if (!img) return null;
    const res = await fetch(img, { signal: AbortSignal.timeout(8000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 5_000_000) return null;
    const path = `${studioId}/${clientId}/${crypto.randomUUID()}/preview.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
    const supabase = await createClient();
    const { error } = await supabase.storage.from("media").upload(path, bytes, { contentType: type });
    return error ? null : path;
  } catch {
    return null;
  }
}
