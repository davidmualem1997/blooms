import "server-only";
import { notFound } from "next/navigation";
import { getContext, memberName } from "@/lib/context";
import { todayIL } from "@/lib/dates";
import { guessIndustry, type Industry } from "@/lib/holidays";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { Brand, ClientEvent, Meeting, Message, Task } from "@/lib/types";

// הנתונים של תיק הלקוח – משותפים לתיק הלקוח ולטאבים בדף הבית (משימות, פגישות, אירועים)
export async function loadFileData(clientId: string) {
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) notFound(); // לקוח שאין גישה אליו (או שנמחק)
  const today = todayIL();
  const supabase = await createClient();
  const isStaff = ctx.role !== "client";
  const [{ data: tasks }, { data: meetings }, { data: openMessages }, { data: events }] = await Promise.all([
    isStaff ? supabase.from("tasks").select("id, title, assignee_id, done").eq("client_id", clientId).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("meetings").select("id, kind, starts_at, location, extra_topics, summary").eq("client_id", clientId).order("starts_at"),
    supabase.from("messages").select("*").eq("client_id", clientId).or("status.eq.to_meeting,and(kind.eq.call,status.neq.done)").order("created_at"),
    supabase.from("client_events").select("*").eq("client_id", clientId).gte("date", today).order("date"),
  ]);
  const brand = (client.brand ?? {}) as Brand;
  const evs = (events ?? []) as ClientEvent[];
  const images = await signPaths([brand.cover_path, brand.logo_path, ...(brand.elements ?? []), ...evs.flatMap((e) => (e.images ?? []).map((i) => i.thumb))]);
  const industry = (brand.industry as Industry) || guessIndustry([client.name, brand.story, brand.audience].join(" "));
  return {
    ctx, client, industry,
    base: {
      clientName: client.name, clientId, studioId: client.studio_id, brand, isStaff,
      isVenue: industry === "food" || industry === "retail", userId: ctx.userId, images, today, events: evs,
      team: ctx.team.map((t) => ({ id: t.id, name: t.full_name || memberName(ctx, t.id) })),
      tasks: (tasks ?? []) as Task[], meetings: (meetings ?? []) as Meeting[], openMessages: (openMessages ?? []) as Message[],
    },
  };
}
