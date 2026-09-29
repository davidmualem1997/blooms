import "server-only";
import { createClient } from "@supabase/supabase-js";

// לקוח עם מפתח השירות – עוקף RLS. לשימוש רק בקוד שרת שלא מופעל ישירות על ידי משתמש (cron)
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
