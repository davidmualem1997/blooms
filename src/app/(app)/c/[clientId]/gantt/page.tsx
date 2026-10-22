import { notFound } from "next/navigation";
import Link from "next/link";
import { Chevron } from "@/components/chevron";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { MONTHS, monthRange, todayIL } from "@/lib/dates";
import type { Brand, ClientEvent, ContentItem, OneOffStory, RecurringStory } from "@/lib/types";
import { calendarEvents, guessIndustry, type Industry } from "@/lib/holidays";
import { GanttBoard } from "./gantt-board";
import { signPaths } from "@/lib/media-server";

export default async function GanttPage({ params, searchParams }: PageProps<"/c/[clientId]/gantt">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayIL();
  const m = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const month = `${m}-01`;
  const [from, to] = monthRange(month);
  const [y, mm] = m.split("-").map(Number);
  const prev = new Date(Date.UTC(y, mm - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 7);

  const supabase = await createClient();
  const [items, recurring, oneOff, checks, focus, custom] = await Promise.all([
    supabase.from("content_items").select("*").eq("client_id", clientId).gte("date", from).lte("date", to).order("date"),
    supabase.from("recurring_stories").select("*").eq("client_id", clientId).order("position"),
    supabase.from("one_off_stories").select("*").eq("client_id", clientId).gte("date", from).lte("date", to),
    supabase.from("story_checks").select("story_ref, date").eq("client_id", clientId).gte("date", from).lte("date", to),
    supabase.from("monthly_focus").select("id, text, done, url").eq("client_id", clientId).eq("month", month).eq("kind", "content").order("position"),
    supabase.from("client_events").select("*").eq("client_id", clientId).gte("date", from).lte("date", to),
  ]);

  const monthItems = (items.data ?? []) as ContentItem[];
  const thumbs = await signPaths(monthItems.flatMap((i) => [i.thumb_path, ...(i.media ?? []).map((m) => m.thumb)]));
  const clientRow = ctx.clients.find((c) => c.id === clientId);
  if (!clientRow) notFound(); // לקוח שאין גישה אליו (או שנמחק)
  const studioId = clientRow.studio_id;
  const brand = (clientRow.brand ?? {}) as Brand;
  const industry = (brand.industry as Industry) || guessIndustry([clientRow.name, brand.story, brand.audience].join(" "));
  const special = calendarEvents(from, to, industry);

  return (
    <>

      <GanttBoard
        key={typeof sp.item === "string" ? sp.item : "board"}
        openItem={typeof sp.item === "string" ? sp.item : undefined}
        title={`${MONTHS[mm - 1]} ${y}`}
        nav={<>
          <Link href={`?m=${prev}`} className="calnav" aria-label="חודש קודם"><Chevron dir="back" /></Link>
          <Link href={`?m=${today.slice(0, 7)}`} className="calnav today-btn" aria-label="החודש הנוכחי">היום</Link>
          <Link href={`?m=${next}`} className="calnav" aria-label="חודש הבא"><Chevron dir="forward" /></Link>
        </>}
        clientId={clientId}
        studioId={studioId}
        thumbs={thumbs}
        month={month}
        today={today}
        canEdit={ctx.role !== "client"}
        items={monthItems}
        recurring={(recurring.data ?? []) as RecurringStory[]}
        oneOff={(oneOff.data ?? []) as OneOffStory[]}
        checks={(checks.data ?? []).map((c) => `${c.story_ref}|${c.date}`)}
        focus={focus.data ?? []}
        special={special}
        custom={(custom.data ?? []) as ClientEvent[]}
      />
    </>
  );
}
