import { NextResponse, type NextRequest } from "next/server";
import { generateWeeklyTrends } from "@/lib/trends";

// Vercel Cron קורא לכאן כל יום ראשון בבוקר (ראו vercel.json)
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const items = await generateWeeklyTrends();
    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
