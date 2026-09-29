import { NextResponse, type NextRequest } from "next/server";
import { GraphError, syncMeta } from "@/lib/integrations/meta";
import { createAdminClient } from "@/lib/supabase/admin";

// סנכרון יומי של כל החיבורים (Vercel Cron – ראו vercel.json)
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: list } = await admin.from("integrations").select("id, client_id, provider").eq("provider", "meta").neq("status", "disconnected");
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const i of list ?? []) {
    try {
      await syncMeta(admin, i);
      results.push({ id: i.id, ok: true });
    } catch (e) {
      // 190 = ההרשאה בוטלה או פגה – צריך להתחבר מחדש
      const expired = e instanceof GraphError && e.code === 190;
      await admin.from("integrations").update({ status: "error", last_error: expired ? "ההרשאה פגה – צריך לחבר מחדש" : (e as Error).message }).eq("id", i.id);
      results.push({ id: i.id, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, results });
}
