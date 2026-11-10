"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// המעבר בתוך "סושיאל": פיד · טיקטוק · סטוריז · כל המדיה
const TABS = [
  { href: "/instagram", label: "פיד" },
  { href: "/tiktok", label: "טיקטוק" },
  { href: "/stories", label: "סטוריז" },
  { href: "/media", label: "כל המדיה" },
];

export function SocialTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  return (
    <nav className="ftabs social-tabs" aria-label="סושיאל">
      {TABS.map((t) => {
        const href = `/c/${clientId}${t.href}`;
        return <Link key={t.href} href={href} className="ftab" aria-current={pathname.startsWith(href) ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
