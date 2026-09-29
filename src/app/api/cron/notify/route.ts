import { NextResponse, type NextRequest } from "next/server";
import { runNotifications } from "@/lib/notify-rules";

// נקרא כל 10 דקות מ-Supabase (pg_cron, ראו migrations/20260929090000_notifications.sql)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runNotifications()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
