import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { metaAuthUrl, metaConfigured } from "@/lib/integrations/meta";
import { createClient } from "@/lib/supabase/server";

// התחלת חיבור ל-Meta עבור לקוח: בודקים שלמשתמש יש גישה ללקוח ומעבירים להתחברות בפייסבוק
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client") ?? "";
  const back = new URL(`/c/${clientId}/file?tab=connections`, request.url);
  if (!metaConfigured()) { back.searchParams.set("err", "meta-not-configured"); return NextResponse.redirect(back); }
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle(); // RLS: רק מי שרואה את הלקוח
  if (!client) return NextResponse.redirect(new URL("/", request.url));

  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(metaAuthUrl(new URL("/api/integrations/meta/callback", request.url).toString(), `${nonce}.${clientId}`));
  res.cookies.set("meta_oauth", nonce, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/integrations/meta" });
  return res;
}
