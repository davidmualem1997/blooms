"use server";

import { extractBrandFromSite, type ExtractedBrand } from "@/lib/brand-extract";
import { getContext } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { safeFetch, scanSite } from "@/lib/site-scrape";
import { createClient } from "@/lib/supabase/server";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico" };

// כתובת אתר של העסק → הצעה למילוי תיק הלקוח, כולל לוגו. שום דבר לא נכנס לתיק בלי אישור
export async function readClientSite(clientId: string, url: string): Promise<{ data?: ExtractedBrand; logo?: { path: string; src: string }; error?: string }> {
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client || ctx.role === "client") return { error: "אין הרשאה" };
  if (!url.trim()) return { error: "צריך כתובת אתר" };
  try {
    const scan = await scanSite(url);
    if (!scan) return { error: "לא הצלחנו לפתוח את האתר. בדקו שהכתובת נכונה." };
    if (scan.text.length < 80 && !scan.logos.length) return { error: "האתר נטען בלי תוכן שאפשר לקרוא (כנראה בנוי כך שרק דפדפן מציג אותו)." };
    const { logo_url, ...data } = await extractBrandFromSite(scan);

    let logo: { path: string; src: string } | undefined;
    if (logo_url) {
      const r = await safeFetch(logo_url, "image/*", 5_000_000).catch(() => null);
      const type = (r?.res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (r && EXT[type] && r.body.byteLength > 200) {
        const path = `${client.studio_id}/${clientId}/${crypto.randomUUID()}/logo.${EXT[type]}`;
        const supabase = await createClient();
        const { error } = await supabase.storage.from("media").upload(path, r.body, { contentType: type });
        if (!error) logo = { path, src: (await signPaths([path]))[path] ?? "" };
      }
    }
    return { data, logo };
  } catch (e) {
    console.error("site extract", (e as Error).message);
    return { error: "לא הצלחנו לקרוא את האתר. נסו שוב." };
  }
}
