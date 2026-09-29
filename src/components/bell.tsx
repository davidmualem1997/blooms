import Link from "next/link";

// פעמון בשורה העליונה – נקודה כשיש פעילות חדשה מאז הביקור האחרון בפיד
export function Bell({ unread }: { unread: number }) {
  return (
    <Link href="/activity" className="bell" aria-label={unread ? `פעילות – ${unread} חדשים` : "פעילות"}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && <i className="bell-dot" />}
    </Link>
  );
}
