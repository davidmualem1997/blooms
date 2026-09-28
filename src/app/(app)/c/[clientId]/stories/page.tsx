import { getContext } from "@/lib/context";
import { parseISODate, toISODate, todayIL, weekday } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { OneOffStory, RecurringStory } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { SocialTabs } from "@/components/social-tabs";
import { StoriesBoard, type StoryDay } from "./stories-board";

// סטוריז: כל מה שעולה בשבועיים הקרובים, יום אחרי יום – קבועים וחד-פעמיים
export default async function StoriesPage({ params }: PageProps<"/c/[clientId]/stories">) {
  const { clientId } = await params;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId)!;
  const today = todayIL();
  const dates = Array.from({ length: 14 }, (_, i) => { const d = parseISODate(today); d.setUTCDate(d.getUTCDate() + i); return toISODate(d); });
  const supabase = await createClient();
  const [recurring, oneOff, checks] = await Promise.all([
    supabase.from("recurring_stories").select("*").eq("client_id", clientId).order("position"),
    supabase.from("one_off_stories").select("*").eq("client_id", clientId).gte("date", dates[0]).lte("date", dates[13]),
    supabase.from("story_checks").select("story_ref, date").eq("client_id", clientId).gte("date", dates[0]).lte("date", dates[13]),
  ]);
  const done = new Set((checks.data ?? []).map((c) => `${c.story_ref}|${c.date}`));
  const ones = (oneOff.data ?? []) as OneOffStory[];
  const days: StoryDay[] = dates.map((d) => ({
    date: d,
    stories: [
      ...ones.filter((s) => s.date === d).map((s) => ({ ref: `o:${s.id}`, id: s.id, title: s.title, recurring: false, media: s.media ?? [], done: done.has(`o:${s.id}|${d}`) })),
      ...((recurring.data ?? []) as RecurringStory[]).filter((s) => s.weekdays.includes(weekday(d)))
        .map((s) => ({ ref: `r:${s.id}`, id: s.id, title: s.title, recurring: true, media: [], done: done.has(`r:${s.id}|${d}`) })),
    ],
  }));
  const logo = (client.brand as { logo_path?: string })?.logo_path;
  const signed = await signPaths([logo, ...ones.flatMap((s) => (s.media ?? []).map((m) => m.thumb))]);

  return (
    <>
      <SocialTabs clientId={clientId} />
      <div className="prof">
        <Avatar src={logo ? signed[logo] : null} name={client.name} size={64} color={client.color} />
        <div>
          <h2>{client.name}</h2>
          {client.ig_handle && <div className="muted" dir="ltr" style={{ textAlign: "right" }}>@{client.ig_handle}</div>}
          <div className="txt num">{days[0].stories.filter((s) => s.done).length}/{days[0].stories.length} סטוריז עלו היום</div>
        </div>
      </div>
      <StoriesBoard clientId={clientId} studioId={client.studio_id} days={days} thumbs={signed} today={today} canEdit={ctx.role !== "client"} />
    </>
  );
}
