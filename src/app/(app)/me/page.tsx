import { getContext } from "@/lib/context";
import { avatarSrc } from "@/lib/types";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "הפרופיל שלי · BLOOMS" };

export default async function MePage() {
  const ctx = await getContext();
  const roleLabel = ctx.role === "owner" ? "מנהלת הסטודיו" : ctx.role === "manager" ? "מנהל/ת לקוחות" : "לקוח";
  return (
    <div className="sec">
      <h1 className="display-title">הפרופיל שלי</h1>
      <ProfileForm userId={ctx.userId} name={ctx.profile.full_name} email={ctx.profile.email ?? ""} avatar={avatarSrc(ctx.profile)} roleLabel={roleLabel} />
    </div>
  );
}
