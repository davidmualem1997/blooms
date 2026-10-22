import Link from "next/link";
import { getContext, hasGeneralDashboard, memberName } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { avatarSrc } from "@/lib/types";
import { ScopeSwitcher } from "@/components/scope-switcher";
import { Bell } from "@/components/bell";
import { Assistant } from "@/components/assistant";
import { HeaderAutoHide } from "@/components/header-auto-hide";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  const supabase = await createClient();
  const [logos, seen] = await Promise.all([
    signPaths(ctx.clients.map((c) => (c.brand as { logo_path?: string })?.logo_path)),
    supabase.from("profiles").select("activity_seen_at").eq("id", ctx.userId).single(),
  ]);
  // פעילות חדשה של אחרים מאז הביקור האחרון בפיד (RLS מסנן מה מותר לראות)
  const { count: unread } = ctx.clients.length && seen.data
    ? await supabase.from("activity").select("id", { count: "exact", head: true }).gt("created_at", seen.data.activity_seen_at).or(`actor_id.is.null,actor_id.neq.${ctx.userId}`)
    : { count: 0 };
  const options = ctx.clients.map((c) => {
    const logo = (c.brand as { logo_path?: string })?.logo_path;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      logo: logo ? logos[logo] ?? null : null,
      sub: ctx.role === "owner" ? (c.manager_id === ctx.userId ? "שלי" : `אצל ${memberName(ctx, c.manager_id)}`) : "",
      manager: memberName(ctx, c.manager_id),
    };
  });
  return (
    <div className="app" dir="rtl">
      <HeaderAutoHide />
      <header className="topbar">
        <Link href="/" className="brandmark" aria-label="BLOOMS – דף הבית">
          <span className="dots" aria-hidden="true"><i /><i /><i /><i /></span>
          BLOOMS
        </Link>
        <div className="topbar-end">
          <Assistant role={ctx.role} />
          <Bell unread={unread ?? 0} />
          <ScopeSwitcher options={options} allowAll={hasGeneralDashboard(ctx)} isClient={ctx.role === "client"} isOwner={ctx.role === "owner"}
            me={{ name: ctx.profile.full_name, avatar: avatarSrc(ctx.profile) }} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
