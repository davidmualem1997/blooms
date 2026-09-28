import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { PortalNav } from "@/components/portal-nav";
import { SendToTeam } from "@/components/client-home-parts";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";

export default async function PortalLayout({ children, params }: LayoutProps<"/c/[clientId]">) {
  const { clientId } = await params;
  const ctx = await getContext();
  // RLS מחזיר רק לקוחות שמותר לראות, ולכן לקוח שלא ברשימה = אין גישה
  if (!ctx.clients.some((c) => c.id === clientId)) notFound();
  // ללקוח: כפתור + צף בכל המסכים – פנייה לצוות
  let fab = null;
  if (ctx.role === "client") {
    const supabase = await createClient();
    const { data: history } = await supabase.from("messages").select("*").eq("client_id", clientId)
      .order("updated_at", { ascending: false }).limit(3);
    fab = <SendToTeam clientId={clientId} studioId={ctx.clients.find((c) => c.id === clientId)!.studio_id} history={(history ?? []) as Message[]} />;
  }
  return (
    <>
      {children}
      {fab}
      <PortalNav clientId={clientId} isClient={ctx.role === "client"} />
    </>
  );
}
