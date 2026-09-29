"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectMetaAccount, disconnectIntegration, syncNow } from "./integration-actions";

type Account = { pageId: string; pageName: string; igUsername: string | null; picture: string | null; hasIg: boolean };

// אחרי ההתחברות לפייסבוק: בוחרים איזה חשבון שייך ללקוח הזה
export function MetaPicker({ clientId, pendingId, accounts, suggested }: { clientId: string; pendingId: string; accounts: Account[]; suggested: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const sorted = [...accounts].sort((a, b) => Number(b.igUsername?.toLowerCase() === suggested) - Number(a.igUsername?.toLowerCase() === suggested) || Number(b.hasIg) - Number(a.hasIg));
  return (
    <div className="card stack">
      <b className="w500">איזה חשבון שייך ללקוח הזה?</b>
      <div className="note">
        {sorted.map((a) => (
          <div key={a.pageId} className="lnk">
            <span className="acct">
              <span className="sav sm" style={a.picture ? { backgroundImage: `url(${a.picture})` } : undefined} />
              <span>{a.igUsername ? `@${a.igUsername}` : a.pageName}<small>{a.hasIg ? `עמוד פייסבוק: ${a.pageName}` : "בלי אינסטגרם עסקי מקושר – רק נתוני פייסבוק"}</small></span>
            </span>
            <button className="edit" disabled={pending} onClick={() => start(async () => {
              const r = await connectMetaAccount(clientId, pendingId, a.pageId);
              if (r.error) setError(r.error);
              else router.replace(`/c/${clientId}/file?tab=connections`);
            })}>חיבור</button>
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <span className="txt">לא רואים את החשבון? הוא צריך להיות חשבון עסקי או יוצר באינסטגרם, מקושר לעמוד פייסבוק שאתם מנהלים.</span>
    </div>
  );
}

export function MetaRow({ clientId, connected, name, status, lastSync, lastError, canConnect }: {
  clientId: string; connected: boolean; name?: string; status?: string; lastSync?: string | null; lastError?: string | null; canConnect: boolean;
}) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!connected) {
    return canConnect
      ? <a className="edit" href={`/api/integrations/meta/start?client=${clientId}`}>חיבור</a>
      : <span className="txt">בקרוב</span>;
  }
  const when = lastSync ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(lastSync)) : "עוד לא";
  return (
    <span className="stack tight conn-on">
      <span className="txt">{status === "error" ? "⚠️ " : "✓ "}{name} · סונכרן: {when}</span>
      {status === "error" && lastError && <span className="error">{lastError}</span>}
      {msg && <span className="txt">{msg}</span>}
      <span className="row-gap">
        <button className="edit" disabled={pending} onClick={() => start(async () => { const r = await syncNow(clientId); setMsg(r.error ?? "סונכרן ✓"); })}>{pending ? "מסנכרן…" : "סנכרון עכשיו"}</button>
        {status === "error" && <a className="edit" href={`/api/integrations/meta/start?client=${clientId}`}>חיבור מחדש</a>}
        <button className="edit danger-link" disabled={pending} onClick={() => start(() => disconnectIntegration(clientId, "meta"))}>ניתוק</button>
      </span>
    </span>
  );
}
