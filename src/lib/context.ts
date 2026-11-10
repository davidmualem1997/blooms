import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { avatarSrc, type Client, type Profile, type Role } from "@/lib/types";

export type AppContext = {
  userId: string;
  profile: Profile;
  role: Role;
  studioId: string | null;
  studioName: string;
  clients: Client[]; // RLS כבר מסנן: מנהלת רואה הכול, מנהל רק שלו, לקוח רק את עצמו
  team: { id: string; full_name: string; role: "owner" | "manager"; avatar: string | null }[];
};

// נטען פעם אחת לכל בקשה ומשותף בין layout לדפים
export const getContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const ctx = await loadContext(supabase, auth.user.id, auth.user.email ?? null);
  if (!ctx) redirect("/onboarding");
  return ctx;
});

// אותו הקשר מכל חיבור של משתמש (גם מחוץ לבקשת דפדפן – למשל בוט הוואטסאפ). null = אין סטודיו ואין לקוחות
export async function loadContext(supabase: SupabaseClient, userId: string, email: string | null): Promise<AppContext | null> {

  const [{ data: profile }, { data: memberships }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, avatar_url, avatar_path").eq("id", userId).single(),
    supabase.from("studio_members").select("studio_id, role, studios(name)").eq("user_id", userId),
    supabase.from("clients").select("id, studio_id, name, ig_handle, color, manager_id, brand").order("name"),
  ]);

  // מי שחבר/ה ביותר מסטודיו אחד: מעדיפים את הסטודיו שיש בו לקוחות, ואז תפקיד בעלים
  type Membership = { studio_id: string; role: "owner" | "manager"; studios: { name: string } | null };
  const all = (memberships ?? []) as unknown as Membership[];
  const withClients = (m: Membership) => (clients ?? []).some((c) => c.studio_id === m.studio_id);
  const membership = [...all].sort((a, b) => Number(withClients(b)) - Number(withClients(a)) || Number(b.role === "owner") - Number(a.role === "owner"))[0];

  let role: Role;
  let studioId: string | null = null;
  let studioName = "";
  if (membership) {
    role = membership.role;
    studioId = membership.studio_id;
    studioName = membership.studios?.name ?? "";
  } else if (clients && clients.length > 0) {
    role = "client";
    studioId = clients[0].studio_id;
  } else {
    return null;
  }

  let team: AppContext["team"] = [];
  if (studioId && role !== "client") {
    const { data } = await supabase
      .from("studio_members")
      .select("role, profiles(id, full_name, avatar_url, avatar_path)")
      .eq("studio_id", studioId);
    team = (data ?? []).map((m) => {
      const p = m.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; avatar_path: string | null };
      return { id: p.id, full_name: p.full_name, role: m.role as "owner" | "manager", avatar: avatarSrc(p) };
    });
  }

  return {
    userId,
    profile: (profile as Profile) ?? { id: userId, full_name: "", email, avatar_url: null },
    role,
    studioId,
    studioName,
    clients: (clients ?? []) as Client[],
    team,
  };
}

// מנהלת הסטודיו רואה דאשבורד כללי תמיד; מנהל לקוחות רק כשיש לו 2 לקוחות ומעלה
export function hasGeneralDashboard(ctx: AppContext): boolean {
  if (ctx.role === "owner") return true;
  if (ctx.role === "manager") return ctx.clients.length >= 2;
  return false;
}

export function memberName(ctx: AppContext, id: string | null): string {
  if (!id) return "לא שויך";
  const m = ctx.team.find((t) => t.id === id);
  if (!m) return "";
  return m.full_name || (m.role === "owner" ? "מנהלת הסטודיו" : "מנהל/ת לקוחות");
}
