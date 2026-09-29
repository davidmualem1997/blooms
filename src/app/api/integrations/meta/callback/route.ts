import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/integrations/crypto";
import { exchangeCode, listAccounts } from "@/lib/integrations/meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// חזרה מפייסבוק: מאמתים את ה-state, מחליפים קוד בהרשאה, ושומרים (מוצפן) את רשימת החשבונות לבחירה
export async function GET(request: NextRequest) {
  const [nonce, clientId] = (request.nextUrl.searchParams.get("state") ?? "").split(".");
  const back = new URL(`/c/${clientId}/file?tab=connections`, request.url);
  const fail = (err: string) => { back.searchParams.set("err", err); const r = NextResponse.redirect(back); r.cookies.delete({ name: "meta_oauth", path: "/api/integrations/meta" }); return r; };

  if (!nonce || nonce !== request.cookies.get("meta_oauth")?.value) return fail("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail(request.nextUrl.searchParams.get("error_reason") === "user_denied" ? "denied" : "no-code");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!auth.user || !client) return fail("access");

  try {
    const token = await exchangeCode(code, new URL("/api/integrations/meta/callback", request.url).toString());
    const accounts = await listAccounts(token);
    if (!accounts.length) return fail("no-pages");
    const admin = createAdminClient();
    await admin.from("integration_pending").delete().lt("created_at", new Date(Date.now() - 3600e3).toISOString());
    const { data: pending } = await admin.from("integration_pending")
      .insert({ user_id: auth.user.id, client_id: clientId, provider: "meta", ciphertext: encryptSecret(accounts) }).select("id").single();
    back.searchParams.set("meta", pending!.id);
    const r = NextResponse.redirect(back);
    r.cookies.delete({ name: "meta_oauth", path: "/api/integrations/meta" });
    return r;
  } catch (e) {
    console.error("meta callback", (e as Error).message);
    return fail("exchange");
  }
}
