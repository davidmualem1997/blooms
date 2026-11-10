import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// חיבור בשם המשתמש (בלי דפדפן): קישור כניסה חד-פעמי שלא נשלח במייל, ומיד מאמתים אותו.
// כך הבוט עובד עם אותן הרשאות (RLS) כמו האפליקציה – לא עם מפתח השירות
export async function asUser(userId: string): Promise<{ supabase: SupabaseClient; email: string | null; done: () => Promise<void> }> {
  const admin = createAdminClient();
  const { data: u, error } = await admin.auth.admin.getUserById(userId);
  if (error || !u.user?.email) throw new Error("user not found");
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (link.error) throw link.error;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const v = await supabase.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (v.error) throw v.error;
  return { supabase, email: u.user.email, done: async () => { await supabase.auth.signOut({ scope: "local" }); } };
}
