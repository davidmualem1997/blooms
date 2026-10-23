import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppContext } from "@/lib/context";
import type { Client } from "@/lib/types";
import type { UrgentNote } from "@/components/urgent-panel";
import type { UrgentTo } from "@/app/(app)/urgent-actions";

// הודעות דחופות של לקוח, מנקודת המבט של מי שצופה: מה הגיע אליו, מה שלח, ולמי מותר לו לשלוח
export async function loadUrgent(supabase: SupabaseClient, ctx: AppContext, client: Client) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await supabase.from("urgent_notes").select("id, body, to_role, from_user, created_at, replies, updated_at").eq("client_id", client.id).is("done_at", null).gte("created_at", since).order("created_at", { ascending: false });
  const me = ctx.userId;
  const isOwner = ctx.role === "owner";
  const managesIt = client.manager_id === me;
  // שם לתצוגה: אני / איש צוות / הלקוח
  const name = (id: string | null) => (id === me ? "את/ה" : ctx.team.find((t) => t.id === id)?.full_name || (ctx.role === "client" ? "הצוות" : client.name));
  const notes = (data ?? []).map((n) => ({
    ...n, from_name: name(n.from_user), mine: n.from_user === me,
    replies: ((n.replies ?? []) as { author_id: string; text: string; at: string }[]).map((r) => ({ ...r, name: name(r.author_id), mine: r.author_id === me })),
  })) as (UrgentNote & { from_user: string | null })[];
  const forMe = (to: UrgentTo) => (ctx.role === "client" ? to === "client" : (to === "owner" && isOwner) || (to === "manager" && managesIt));
  const recipients: UrgentTo[] = ctx.role === "client" ? []
    : isOwner ? [...(client.manager_id && !managesIt ? (["manager"] as UrgentTo[]) : []), "client"]
    : ["owner", "client"];
  return {
    // כל השיחות הפתוחות שאני חלק מהן – ששלחתי או שנשלחו אליי – מהעדכנית
    threads: notes.filter((n) => n.mine || forMe(n.to_role)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    recipients,
  };
}
