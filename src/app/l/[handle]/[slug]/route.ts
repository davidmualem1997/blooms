import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// קישור מעקב של BLOOMS: רושמים את הלחיצה ומעבירים מיד ליעד.
// לא שומרים IP או פרטים מזהים. בוטים ותצוגות מקדימות (וואטסאפ, אינסטגרם) לא נספרים.
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|curl|wget|python|headless/i;

export async function GET(request: NextRequest, { params }: RouteContext<"/l/[handle]/[slug]">) {
  const { handle, slug } = await params;
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("id").eq("link_handle", handle.toLowerCase()).maybeSingle();
  const { data: link } = client
    ? await admin.from("links").select("id, target, active").eq("client_id", client.id).eq("slug", slug.toLowerCase()).maybeSingle()
    : { data: null };
  if (!client || !link?.active) return NextResponse.redirect(new URL(`/l/${handle}`, request.url));

  const ua = request.headers.get("user-agent") ?? "";
  if (!BOT.test(ua) && request.method === "GET") {
    const source = (request.nextUrl.searchParams.get("s") ?? "").replace(/[^\w֐-׿-]/g, "").slice(0, 40);
    let referrer = "";
    try { referrer = new URL(request.headers.get("referer") ?? "").hostname.replace(/^www\./, ""); } catch {}
    if (!referrer && /instagram/i.test(ua)) referrer = "instagram.com"; // הדפדפן של אינסטגרם לא שולח referrer
    if (!referrer && /tiktok|musical_ly|bytedance/i.test(ua)) referrer = "tiktok.com";
    after(async () => { await admin.from("link_clicks").insert({ link_id: link.id, client_id: client.id, source, referrer }); });
  }

  // tel: – חלק מהדפדפנים לא עוברים להפניה ישירה, לכן עמוד קטן עם כפתור
  if (link.target.startsWith("tel:")) {
    const num = link.target.slice(4);
    return new NextResponse(
      `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>שיחה</title></head>` +
      `<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;background:#faf8f5"><a href="${link.target}" style="font-size:20px;padding:16px 28px;border-radius:99px;background:#141414;color:#fff;text-decoration:none">להתקשר ${num}</a>` +
      `<script>location.href=${JSON.stringify(link.target)}</script></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  return NextResponse.redirect(link.target, { status: 302, headers: { "cache-control": "no-store" } });
}
