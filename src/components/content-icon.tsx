// אייקון לכל סוג תוכן/אירוע – קו דק בסגנון SF Symbols, צבע לפי הטקסט שמסביב
export type IconKind = "post" | "reel" | "tiktok" | "story" | "meeting" | "team" | "event" | "holiday" | "memorial" | "deadline" | "task";

const PATHS: Record<IconKind, React.ReactNode> = {
  post: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="9" cy="9.5" r="1.6" /><path d="M20.5 15.5l-4.5-4.5-8.5 9" /></>,
  reel: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M3.5 8.5h17M8 3.5l2.5 5M13.5 3.5l2.5 5" /><path d="M10.5 12.3v4.4l3.8-2.2z" /></>,
  tiktok: <><path d="M14 3.5v11.25a3.25 3.25 0 1 1-3.25-3.25" /><path d="M14 3.5c.4 2.4 2.2 4.1 4.75 4.4" /></>,
  story: <><circle cx="12" cy="12" r="8.5" strokeDasharray="3.2 2.2" /><circle cx="12" cy="12" r="4.5" /></>,
  meeting: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16.2 14.6c2.1.1 3.8 1.5 4.3 4" /></>,
  team: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c.7-3.4 3.3-5.2 6.5-5.2s5.8 1.8 6.5 5.2" /></>,
  event: <path d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  holiday: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="2.6" /></>,
  memorial: <path d="M12 4c2 2.6 3 4.7 3 6.4a3 3 0 0 1-6 0C9 8.7 10 6.6 12 4zM12 13.4V20M8.5 20h7" />,
  deadline: <><path d="M5.5 20.5V4" /><path d="M5.5 4.5h11l-2.2 3.5 2.2 3.5h-11" /></>,
  task: <><rect x="4" y="4" width="16" height="16" rx="5" /><path d="M8.5 12.2l2.4 2.3 4.6-4.9" /></>,
};

export function ContentIcon({ kind, size = 14 }: { kind: IconKind; size?: number }) {
  return (
    <svg className="cicon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[kind]}
    </svg>
  );
}
