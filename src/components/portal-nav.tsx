"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "היום", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { href: "/gantt", label: "גאנט", icon: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></> },
  { href: "/instagram", match: ["/instagram", "/tiktok", "/stories", "/media"], label: "סושיאל", icon: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 5.5h3" /><path d="M12 16.5l-2.4-2.3a1.6 1.6 0 0 1 2.4-2.1 1.6 1.6 0 0 1 2.4 2.1z" /></> },
  { href: "/inspiration", label: "השראה", staffOnly: true, icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /> },
  { href: "/file", label: "תיק לקוח", icon: <><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></> },
];

export function PortalNav({ clientId, isClient }: { clientId: string; isClient: boolean }) {
  const pathname = usePathname();
  const base = `/c/${clientId}`;
  const tabs = TABS.filter((t) => !(isClient && t.staffOnly));
  const active = tabs.find((t) => (t.href ? ("match" in t && t.match ? t.match : [t.href]).some((h) => pathname.startsWith(base + h)) : pathname === base));
  return (
    <>
      <nav className="nav" aria-label="מסכים">
        {tabs.map((t) => (
          <Link key={t.label} href={base + t.href} aria-label={t.label} aria-current={active === t ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
