import Link from "next/link";
import { Chevron } from "@/components/chevron";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { MONTHS, todayIL } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { Idea } from "@/lib/types";
import { IdeasBoard } from "./ideas-board";

export default async function InspirationPage({ params, searchParams }: PageProps<"/c/[clientId]/inspiration">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  if (ctx.role === "client") notFound();
  const today = todayIL();
  const m = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [y, mm] = m.split("-").map(Number);
  const prev = new Date(Date.UTC(y, mm - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 7);

  const supabase = await createClient();
  const [{ data }, { data: briefs }] = await Promise.all([
    supabase.from("ideas").select("*, author:profiles!ideas_created_by_fkey(full_name)").eq("client_id", clientId).eq("month", `${m}-01`).order("created_at"),
    supabase.from("briefs").select("id, title, shoot_date, location").eq("client_id", clientId).order("shoot_date", { ascending: false }),
  ]);
  const ideas = ((data ?? []) as (Idea & { author: { full_name: string } | null })[]).map((i) => ({ ...i, author: i.author?.full_name ?? "" }));
  const images = await signPaths(ideas.map((i) => i.image_path));
  const client = ctx.clients.find((c) => c.id === clientId)!;

  return (
    <>
      <div className="mhead">
        <Link href={`?m=${prev}`} aria-label="חודש קודם"><Chevron dir="back" /></Link>
        <h2>{MONTHS[mm - 1]} {y}</h2>
        <Link href={`?m=${next}`} aria-label="חודש הבא"><Chevron dir="forward" /></Link>
      </div>
      <IdeasBoard clientId={clientId} studioId={client.studio_id} month={`${m}-01`} today={today} ideas={ideas} images={images} />
      <section className="sec">
        <div className="sechead"><div className="label dotted">בריפים</div><Link className="edit" href={`/c/${clientId}/briefs/new`}>בריף חדש</Link></div>
        <div className="note">
          {(briefs ?? []).map((b) => (
            <Link key={b.id} href={`/c/${clientId}/briefs/${b.id}`} className="lnk">
              <span>{b.title}<small style={{ direction: "rtl" }}>{[b.shoot_date ? b.shoot_date.split("-").reverse().join(".") : "", b.location].filter(Boolean).join(" · ")}</small></span>
              <span className="arrow"><Chevron dir="forward" /></span>
            </Link>
          ))}
          {!briefs?.length && <p className="empty">עוד אין בריפים. בריף מרכז את כל מה שצריך ליום צילום: רעיון, סרטונים, ציוד, לבוש ולוחות זמנים.</p>}
        </div>
      </section>
    </>
  );
}
