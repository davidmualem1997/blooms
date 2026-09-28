import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { MONTHS, WEEKDAYS, parseISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { BriefInput } from "../actions";
import { BriefView } from "./brief-view";

export default async function BriefPage({ params, searchParams }: PageProps<"/c/[clientId]/briefs/[briefId]">) {
  const { clientId, briefId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select("*").eq("id", briefId).eq("client_id", clientId).single();
  if (!data) notFound();
  const brief = data as BriefInput & { id: string };
  const d = brief.shoot_date ? parseISODate(brief.shoot_date) : null;
  const when = d ? `יום ${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "";
  return (
    <div className="sec">
      <Link className="edit" href={`/c/${clientId}/inspiration`}>חזרה להשראה</Link>
      <BriefView clientId={clientId} brief={brief} when={when} canEdit={ctx.role !== "client"} editing={sp.edit === "1"} />
    </div>
  );
}
