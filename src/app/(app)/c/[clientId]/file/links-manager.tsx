"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { LINK_KINDS, type LinkKind } from "@/lib/links";
import { deleteLink, linksFromClientFile, saveLink, setLinkHandle } from "./links-actions";

export type LinkRow = { id: string; slug: string; label: string; kind: LinkKind; target: string; clicks: number };

const copyText = async (t: string, done: (m: string) => void) => {
  try { await navigator.clipboard.writeText(t); done("הועתק"); } catch { done(t); }
};

// קישורי BLOOMS בתיק הלקוח: כתובת הלינק בביו, הקישורים, וכמה לחצו על כל אחד ב-30 הימים האחרונים
export function LinksManager({ clientId, base, handle, links, isStaff, suggestedHandle }: {
  clientId: string; base: string; handle: string | null; links: LinkRow[]; isStaff: boolean; suggestedHandle: string;
}) {
  const [edit, setEdit] = useState<LinkRow | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const bio = handle ? `${base}/l/${handle}` : "";

  if (!handle) {
    if (!isStaff) return <p className="txt">הצוות עוד לא הגדיר לינק בביו.</p>;
    return (
      <form className="card stack" action={(fd) => start(async () => { const r = await setLinkHandle(clientId, String(fd.get("h") ?? "")); setMsg(r.error ?? ""); })}>
        <b className="w500">כתובת ללינק בביו</b>
        <span className="txt">באנגלית, בלי רווחים. זו הכתובת שתופיע בביו של אינסטגרם וטיקטוק.</span>
        <div className="handle-row" dir="ltr"><span className="txt">{base.replace(/^https?:\/\//, "")}/l/</span><input name="h" defaultValue={suggestedHandle} required /></div>
        {msg && <p className="error">{msg}</p>}
        <div className="acts2"><span /><button className="pbtn" disabled={pending}>שמירה</button></div>
      </form>
    );
  }

  return (
    <div className="stack">
      <div className="card stack tight">
        <span className="label">הלינק בביו</span>
        <a className="edit" href={bio} target="_blank" rel="noopener" dir="ltr">{bio.replace(/^https?:\/\//, "")}</a>
        <span className="row-gap">
          <button className="tbtn" onClick={() => copyText(bio, setMsg)}>העתקה לביו</button>
          <button className="tbtn" onClick={() => copyText(`${bio}?s=story`, setMsg)}>קישור לסטורי</button>
        </span>
        {msg && <span className="txt" dir="auto">{msg}</span>}
      </div>

      <div className="note">
        {links.map((l) => (
          <div key={l.id} className="lnk">
            <span>{l.label}<small>{LINK_KINDS.find((k) => k.k === l.kind)?.l} · <b className="num">{l.clicks}</b> לחיצות ב-30 יום</small></span>
            <span className="row-gap">
              <button className="edit" onClick={() => copyText(`${base}/l/${handle}/${l.slug}`, setMsg)}>העתקה</button>
              {isStaff && <button className="edit" onClick={() => setEdit(l)}>עריכה</button>}
            </span>
          </div>
        ))}
        {!links.length && <p className="empty">עוד אין קישורים</p>}
      </div>
      {isStaff && (
        <span className="row-gap">
          <button className="pbtn" onClick={() => setEdit("new")}>קישור חדש</button>
          <button className="tbtn" disabled={pending} onClick={() => start(() => linksFromClientFile(clientId))}>יצירה מהפרטים בתיק הלקוח</button>
        </span>
      )}

      {edit && (
        <LinkSheet clientId={clientId} link={edit === "new" ? null : edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function LinkSheet({ clientId, link, onClose }: { clientId: string; link: LinkRow | null; onClose: () => void }) {
  const [kind, setKind] = useState<LinkKind>(link?.kind ?? "reservation");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const isPhone = kind === "phone" || kind === "whatsapp";
  return (
    <Sheet onClose={onClose} label="קישור" busy={pending}>
      <form className="stack" action={(fd) => start(async () => {
        const r = await saveLink(clientId, { id: link?.id, kind, label: String(fd.get("label") ?? ""), target: String(fd.get("target") ?? "") });
        if (r.error) setError(r.error); else onClose();
      })}>
        <h2>{link ? "עריכת קישור" : "קישור חדש"}</h2>
        <div className="field"><span className="label">סוג · קובע איך זה ייספר בדוח</span>
          <div className="seg wrap">{LINK_KINDS.map((k) => <button type="button" key={k.k} aria-pressed={kind === k.k} onClick={() => setKind(k.k)}>{k.l}</button>)}</div>
        </div>
        <label className="field"><span className="label">הטקסט על הכפתור</span><input name="label" defaultValue={link?.label} placeholder={LINK_KINDS.find((k) => k.k === kind)?.l} /></label>
        <label className="field"><span className="label">{isPhone ? "מספר טלפון" : "לאן הקישור מוביל"}</span>
          <input name="target" dir="ltr" inputMode={isPhone ? "tel" : "url"} defaultValue={link?.target.replace(/^tel:/, "")} placeholder={isPhone ? "050-1234567" : "ontopo.com/…"} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="acts2">
          {link ? <button type="button" className="tbtn danger" onClick={() => start(async () => { await deleteLink(clientId, link.id); onClose(); })}>מחיקה</button> : <span />}
          <button className="pbtn" disabled={pending}>שמירה</button>
        </div>
      </form>
    </Sheet>
  );
}
