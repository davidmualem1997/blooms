import { redirect } from "next/navigation";
import { getContext, hasGeneralDashboard } from "@/lib/context";
import { Dashboard } from "@/components/dashboard";
import { OwnerDashboard } from "@/components/owner-dashboard";

export default async function HomePage() {
  const ctx = await getContext();
  // לקוח, או מנהל עם לקוח אחד – נכנסים ישר לפורטל
  if (!hasGeneralDashboard(ctx)) {
    if (ctx.clients[0]) redirect(`/c/${ctx.clients[0].id}`);
    return <p className="empty sec">עוד לא שויכו אליך לקוחות.</p>;
  }
  if (ctx.role === "owner") return <OwnerDashboard ctx={ctx} />;
  return <Dashboard ctx={ctx} clients={ctx.clients} portal={false} />;
}
