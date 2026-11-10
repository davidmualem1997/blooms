import Link from "next/link";
import { getContext } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";
import { RequestCard } from "@/components/request-card";

const FILTERS = [
  { k: "open", l: "פתוחות", statuses: ["new", "in_progress"] },
  { k: "meeting", l: "לשיחה הבאה", statuses: ["to_meeting"] },
  { k: "done", l: "טופלו", statuses: ["done"] },
] as const;

// כל הפניות מכל הלקוחות (לצוות), עם סינון
export default async function AllRequestsPage({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const ctx = await getContext();
  const f = FILTERS.find((x) => x.k === sp.f) ?? FILTERS[0];
  const ids = ctx.clients.map((c) => c.id);
  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase.from("messages").select("*, author:profiles!messages_created_by_fkey(full_name)").in("client_id", ids).in("status", [...f.statuses]).order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const list = (data ?? []) as (Message & { author: { full_name: string } | null })[];
  const thumbs = await signPaths(list.flatMap((m) => m.attachments.map((a) => a.thumb)));
  const names = Object.fromEntries(ctx.team.map((t) => [t.id, t.full_name]));
  const clientName = Object.fromEntries(ctx.clients.map((c) => [c.id, c.name]));
  return (
    <div className="sec">
      <h1 className="display-title">פניות מלקוחות</h1>
      <nav className="ftabs" aria-label="סינון">
        {FILTERS.map((x) => <Link key={x.k} href={`?f=${x.k}`} className="ftab" aria-current={x.k === f.k ? "page" : undefined}>{x.l}</Link>)}
      </nav>
      <div className="stack">
        {list.map((m) => (
          <div key={m.id} className="stack tight">
            <Link className="label dotted" href={`/c/${m.client_id}`}>{clientName[m.client_id]}</Link>
            <RequestCard clientId={m.client_id} m={m} thumbs={thumbs} isStaff={ctx.role !== "client"} names={names} me={ctx.userId} author={m.author?.full_name} />
          </div>
        ))}
        {!list.length && <p className="txt">אין פניות כאן</p>}
      </div>
    </div>
  );
}
