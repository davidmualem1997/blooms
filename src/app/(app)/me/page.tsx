import { getContext } from "@/lib/context";
import { avatarSrc } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { PushToggle } from "./push-toggle";
import { WhatsAppConnect } from "./whatsapp-connect";
import { createClient } from "@/lib/supabase/server";
import { displayNumber } from "@/lib/integrations/whatsapp";

export const metadata = { title: "הפרופיל שלי · BLOOMS" };

export default async function MePage() {
  const ctx = await getContext();
  const staff = ctx.role !== "client";
  // הבוט פתוח כרגע לצוות בלבד
  const [link, botNumber] = staff ? await Promise.all([
    createClient().then((s) => s.from("whatsapp_links").select("phone").eq("user_id", ctx.userId).maybeSingle()).then((r) => r.data?.phone ?? null),
    displayNumber().catch(() => null),
  ]) : [null, null];
  const roleLabel = ctx.role === "owner" ? "מנהלת הסטודיו" : ctx.role === "manager" ? "מנהל/ת לקוחות" : "לקוח";
  return (
    <div className="sec">
      <h1 className="display-title">הפרופיל שלי</h1>
      <ProfileForm userId={ctx.userId} name={ctx.profile.full_name} email={ctx.profile.email ?? ""} avatar={avatarSrc(ctx.profile)} roleLabel={roleLabel} />
      <PushToggle />
      {staff && <WhatsAppConnect linked={link} botNumber={botNumber} />}
    </div>
  );
}
