"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./avatar";

export type ScopeOption = { id: string; name: string; color: string; sub: string; logo: string | null; manager: string };

const initial = (name: string) => name.replace(/[^א-תA-Za-z0-9]/g, "")[0] ?? "?";

// כפתור אחד בפינה העליונה: איפה אני (לקוח / כל הלקוחות) + הפרופיל שלי.
// לחיצה על השם פותחת את הבחירה בין הפורטלים; לחיצה על התמונה – לפרופיל.
export function ScopeSwitcher({ options, allowAll, isClient, isOwner, me }: {
  options: ScopeOption[]; allowAll: boolean; isClient: boolean; isOwner: boolean;
  me: { name: string; avatar: string | null };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const currentId = pathname.match(/^\/c\/([^/]+)/)?.[1];
  const current = options.find((o) => o.id === currentId);
  // גם לקוח שמשויך לשני עסקים יכול לעבור ביניהם
  const canSwitch = allowAll || options.length > 1 || isOwner;

  const mark = current
    ? <span className="sav md" style={current.logo ? { backgroundImage: `url(${current.logo})` } : { background: current.color }}>{current.logo ? "" : initial(current.name)}</span>
    : <span className="sav md all">▦</span>;
  const title = current ? current.name : "כל הלקוחות";

  return (
    <div className="combo">
      {canSwitch ? (
        <button className="combo-scope" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${title} – החלפת לקוח`} title={title}>
          {mark}<span className="chev" aria-hidden="true">▾</span>
        </button>
      ) : (
        <span className="combo-scope static" title={title}>{mark}</span>
      )}
      <Link href="/me" className="combo-me" aria-label="הפרופיל שלי"><Avatar src={me.avatar} name={me.name} size={34} /></Link>

      {open && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="בחירת פורטל">
            <div className="grab" />
            <h2>לאן נכנסים?</h2>
            {current && !isClient && <span className="txt">עכשיו: {current.name} · מנהל לקוח: {current.manager}</span>}
            <div className="note soft">
              {allowAll && (
                <Link className="scopeopt" href="/" onClick={() => setOpen(false)} aria-current={!current ? "page" : undefined}>
                  <span className="sav all">▦</span>
                  <span className="sname">כל הלקוחות<small>דאשבורד כללי</small></span>
                </Link>
              )}
              {options.map((o) => (
                <Link key={o.id} className="scopeopt" href={`/c/${o.id}`} onClick={() => setOpen(false)} aria-current={o.id === currentId ? "page" : undefined}>
                  <span className="sav" style={o.logo ? { backgroundImage: `url(${o.logo})` } : { background: o.color }}>{o.logo ? "" : initial(o.name)}</span>
                  <span className="sname">{o.name}<small>{o.sub || `מנהל לקוח: ${o.manager}`}</small></span>
                </Link>
              ))}
            </div>
            <div className="acts2">
              {isOwner ? (
                <span className="row-gap">
                  <Link className="edit" href="/clients" onClick={() => setOpen(false)}>ניהול לקוחות</Link>
                  <Link className="edit" href="/team" onClick={() => setOpen(false)}>ניהול צוות</Link>
                </span>
              ) : <span />}
              <Link className="edit" href="/me" onClick={() => setOpen(false)}>הפרופיל שלי</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
