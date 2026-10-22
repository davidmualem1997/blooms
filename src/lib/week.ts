import { createClient } from "@/lib/supabase/server";
import { deadlines, formatIL, israelToUTC, monthName, parseISODate, toISODate } from "@/lib/dates";
import { calendarEvents } from "@/lib/holidays";
import type { Client, ClientEvent, ContentItem, Meeting, TeamMeeting } from "@/lib/types";

export type AgendaEntry = {
  kind: "post" | "reel" | "tiktok" | "meeting" | "team" | "event" | "holiday" | "memorial" | "deadline";
  title: string;
  sub: string;
  time?: string;
  href?: string;
  done?: boolean;
  people?: string[]; // מזהי משתתפים (פגישות צוות)
};
export type AgendaDay = { date: string; entries: AgendaEntry[] };

// השבוע (ראשון–שבת) של כל הלקוחות הנראים: תוכן, פגישות לקוח, פגישות צוות, אירועים וחגים
export async function loadWeek(clients: Client[], today: string): Promise<AgendaDay[]> {
  const first = parseISODate(today);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(first); d.setUTCDate(d.getUTCDate() + i); return toISODate(d); });
  const [from, to] = [dates[0], dates[6]];
  const ids = clients.map((c) => c.id);
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const supabase = await createClient();
  const range = [israelToUTC(from, "00:00"), israelToUTC(to, "23:59")];

  const [items, meetings, team, events] = await Promise.all([
    ids.length ? supabase.from("content_items").select("*").in("client_id", ids).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("meetings").select("*").in("client_id", ids).gte("starts_at", range[0]).lte("starts_at", range[1]) : Promise.resolve({ data: [] }),
    supabase.from("team_meetings").select("*").gte("starts_at", range[0]).lte("starts_at", range[1]),
    ids.length ? supabase.from("client_events").select("*").in("client_id", ids).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
  ]);

  const days: AgendaDay[] = dates.map((date) => ({ date, entries: [] }));
  const push = (date: string, e: AgendaEntry) => days.find((d) => d.date === date)?.entries.push(e);

  // דדליינים של הסטודיו: הגשת תוכנית (20 בחודש) ואישור סופי (סוף החודש)
  const dl = deadlines(today);
  push(dl.submit.date, { kind: "deadline", title: `הגשת תוכנית ${monthName(dl.submit.month)}`, sub: "" });
  push(dl.approve.date, { kind: "deadline", title: `אישור סופי – ${monthName(dl.approve.month)}`, sub: "" });

  for (const h of calendarEvents(from, to, "other")) {
    push(h.date, { kind: h.kind === "memorial" ? "memorial" : h.kind === "holiday" ? "holiday" : "event", title: h.title, sub: "" }); // רק מועדי ישראל = חג
  }
  for (const m of (team.data ?? []) as TeamMeeting[]) {
    const { date, time } = formatIL(m.starts_at);
    push(date, { kind: "team", title: "פגישת צוות", sub: m.location, time, people: m.attendee_ids });
  }
  for (const m of (meetings.data ?? []) as (Meeting & { client_id: string })[]) {
    const { date, time } = formatIL(m.starts_at);
    push(date, { kind: "meeting", title: `פגישה · ${name[m.client_id]}`, sub: m.location, time, href: `/c/${m.client_id}/file` });
  }
  for (const e of (events.data ?? []) as ClientEvent[]) {
    push(e.date, { kind: "event", title: e.title, sub: name[e.client_id], href: `/c/${e.client_id}/gantt` });
  }
  for (const i of (items.data ?? []) as ContentItem[]) {
    push(i.date, { kind: i.type, title: i.title, sub: name[i.client_id], href: `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`, done: i.status === "live", ...(i.time ? { time: i.time.slice(0, 5) } : {}) });
  }
  const order = { holiday: 0, memorial: 0, deadline: 1, team: 2, meeting: 2, event: 3, post: 4, reel: 4, tiktok: 4 } as const;
  for (const d of days) d.entries.sort((a, b) => order[a.kind] - order[b.kind] || (a.time ?? "").localeCompare(b.time ?? ""));
  return days;
}
