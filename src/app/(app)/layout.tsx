import Link from "next/link";
import { getContext, hasGeneralDashboard, memberName } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { avatarSrc } from "@/lib/types";
import { ScopeSwitcher } from "@/components/scope-switcher";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getContext();
  const logos = await signPaths(ctx.clients.map((c) => (c.brand as { logo_path?: string })?.logo_path));
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
      <header className="topbar">
        <Link href="/" className="brandmark" aria-label="BLOOMS – דף הבית">
          <span className="dots" aria-hidden="true"><i /><i /><i /><i /></span>
          BLOOMS
        </Link>
        <ScopeSwitcher options={options} allowAll={hasGeneralDashboard(ctx)} isClient={ctx.role === "client"} isOwner={ctx.role === "owner"}
          me={{ name: ctx.profile.full_name, avatar: avatarSrc(ctx.profile) }} />
      </header>
      <main>{children}</main>
    </div>
  );
}
