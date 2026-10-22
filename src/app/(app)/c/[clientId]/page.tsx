import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { Dashboard } from "@/components/dashboard";
import { ClientHome } from "@/components/client-home";

export default async function PortalHome({ params }: PageProps<"/c/[clientId]">) {
  const { clientId } = await params;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) notFound(); // לקוח שאין גישה אליו (או שנמחק)
  if (ctx.role === "client") return <ClientHome client={client} userName={ctx.profile.full_name} userId={ctx.userId} />;
  return <Dashboard ctx={ctx} clients={[client]} portal />;
}
