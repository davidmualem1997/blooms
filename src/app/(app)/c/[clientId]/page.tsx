import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { Dashboard, PORTAL_TABS, type PortalTab } from "@/components/dashboard";
import { ClientHome } from "@/components/client-home";
import { ClientFile } from "./file/client-file";
import { loadFileData } from "./file/load";
import { ReportView } from "./report/report-view";

// דף הבית של לקוח. לצוות: טאבים – היום / משימות / פגישות / אירועים / נתונים
export default async function PortalHome({ params, searchParams }: PageProps<"/c/[clientId]">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) notFound(); // לקוח שאין גישה אליו (או שנמחק)
  if (ctx.role === "client") return <ClientHome client={client} userName={ctx.profile.full_name} userId={ctx.userId} />;

  const tab = (PORTAL_TABS.some((t) => t.k === sp.tab) ? sp.tab : "today") as PortalTab;
  let content: React.ReactNode = null;
  if (tab === "tasks" || tab === "meetings" || tab === "events") {
    const { base } = await loadFileData(clientId);
    content = <ClientFile {...base} embed={tab} />;
  } else if (tab === "data") {
    content = <ReportView clientId={clientId} m={typeof sp.m === "string" ? sp.m : undefined} q="tab=data&" />;
  }
  return <Dashboard ctx={ctx} clients={[client]} portal tab={tab} tabContent={content} />;
}
