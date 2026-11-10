import Link from "next/link";
import { getContext } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";
import { RequestCard } from "@/components/request-card";

const FILTERS = [
  { k: "open", l: "פתוחות", statuses: ["new", "in_progress"] },
  { k: "done", l: "טופלו", statuses: ["done"] },
  { k: "meeting", l: "נושאים לפגישה", statuses: ["to_meeting"] },
] as const;

// כל הפניות של הלקוח, עם סינון. הלקוח רואה את ההיסטוריה; הצוות גם מנהל סטטוס ומגיב
export default async function RequestsPage({ params, searchParams }: PageProps<"/c/[clientId]/requests">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const f = FILTERS.find((x) => x.k === sp.f) ?? FILTERS[0];
  const supabase = await createClient();
  const { data } = await supabase.from("messages").select("*, author:profiles!messages_created_by_fkey(full_name)")
    .eq("client_id", clientId).in("status", [...f.statuses]).order("created_at", { ascending: false });
  const list = (data ?? []) as (Message & { author: { full_name: string } | null })[];
  const thumbs = await signPaths(list.flatMap((m) => m.attachments.map((a) => a.thumb)));
  const names = Object.fromEntries(ctx.team.map((t) => [t.id, t.full_name]));
  const isStaff = ctx.role !== "client";

  return (
    <div className="sec">
      <h1 className="display-title">פניות</h1>
      <nav className="ftabs" aria-label="סינון פניות">
        {FILTERS.map((x) => <Link key={x.k} href={`?f=${x.k}`} className="ftab" aria-current={x.k === f.k ? "page" : undefined}>{x.l}</Link>)}
      </nav>
      <div className="stack">
        {list.map((m) => (
          <RequestCard key={m.id} clientId={clientId} m={m} thumbs={thumbs} isStaff={isStaff} names={names} me={ctx.userId}
            author={isStaff ? m.author?.full_name : undefined} />
        ))}
        {!list.length && <p className="empty">אין פניות {f.k === "open" ? "פתוחות" : f.k === "done" ? "שטופלו" : "שהועברו לפגישה"}</p>}
      </div>
      {!isStaff && <span className="txt">פנייה חדשה שולחים בכפתור ה-+ בפינה.</span>}
    </div>
  );
}
