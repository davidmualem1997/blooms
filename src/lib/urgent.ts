import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppContext } from "@/lib/context";
import type { Client } from "@/lib/types";
import type { UrgentNote } from "@/components/urgent-panel";
import type { UrgentTo } from "@/app/(app)/urgent-actions";

// הודעות דחופות של לקוח, מנקודת המבט של מי שצופה: מה הגיע אליו, מה שלח, ולמי מותר לו לשלוח
export async function loadUrgent(supabase: SupabaseClient, ctx: AppContext, client: Client) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await supabase.from("urgent_notes").select("id, body, to_role, from_user, created_at").eq("client_id", client.id).is("done_at", null).gte("created_at", since).order("created_at", { ascending: false });
  const me = ctx.userId;
  const isOwner = ctx.role === "owner";
  const managesIt = client.manager_id === me;
  const name = (id: string | null) => ctx.team.find((t) => t.id === id)?.full_name || "הצוות";
  const notes = (data ?? []).map((n) => ({ ...n, from_name: name(n.from_user), mine: n.from_user === me })) as (UrgentNote & { from_user: string | null })[];
  const forMe = (to: UrgentTo) => (ctx.role === "client" ? to === "client" : (to === "owner" && isOwner) || (to === "manager" && managesIt));
  const recipients: UrgentTo[] = ctx.role === "client" ? []
    : isOwner ? [...(client.manager_id && !managesIt ? (["manager"] as UrgentTo[]) : []), "client"]
    : ["owner", "client"];
  return {
    incoming: notes.filter((n) => !n.mine && forMe(n.to_role)),
    sent: notes.filter((n) => n.mine).slice(0, 5),
    recipients,
  };
}
