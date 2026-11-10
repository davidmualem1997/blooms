import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import type { ContentItem, OneOffStory } from "@/lib/types";
import { SocialTabs } from "@/components/social-tabs";
import { MediaBoard } from "./media-board";

// כל המדיה: כל התוכן של הלקוח במקום אחד – פיד, ריילס, טיקטוק וסטוריז, מהחדש לישן
export default async function MediaPage({ params }: PageProps<"/c/[clientId]/media">) {
  const { clientId } = await params;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) notFound();
  const supabase = await createClient();
  const [items, stories] = await Promise.all([
    supabase.from("content_items").select("*").eq("client_id", clientId).order("date", { ascending: false }),
    supabase.from("one_off_stories").select("*").eq("client_id", clientId).order("date", { ascending: false }),
  ]);
  const list = (items.data ?? []) as ContentItem[];
  const ones = (stories.data ?? []) as OneOffStory[];
  const isClient = ctx.role === "client";
  // תמונות ממוזערות לרשת; לסטוריז (ולפוסטים אצל הלקוח) גם הקבצים המלאים, כי הם נפתחים לצפייה
  const urls = await signPaths([
    ...list.map((i) => i.thumb_path),
    ...list.filter((i) => !i.thumb_path).map((i) => i.media.find((m) => m.kind === "video")?.path),
    ...(isClient ? list.flatMap((i) => i.media.flatMap((m) => [m.path, m.thumb])) : []),
    ...ones.flatMap((s) => (s.media ?? []).flatMap((m) => [m.path, m.thumb])),
  ]);
  return (
    <>
      <SocialTabs clientId={clientId} />
      <MediaBoard clientId={clientId} studioId={client.studio_id} items={list} stories={ones} urls={urls} canEdit={!isClient} />
    </>
  );
}
