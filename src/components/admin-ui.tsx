"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteAction, setClientIndustry, setClientManager, type InviteState } from "@/app/(app)/admin-actions";
import { INDUSTRY_LABEL, type Industry } from "@/lib/holidays";
import { Sheet } from "./sheet";

// טופס הזמנה לפי מייל. אחרי ההזמנה מוצגת הודעה מוכנה לשליחה בוואטסאפ
export function InviteForm({ clientId, placeholderName }: { clientId?: string; placeholderName: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <form action={action} className="stack" key={state.share?.email ?? "form"}>
        {clientId && <input type="hidden" name="client" value={clientId} />}
        <input name="name" placeholder={placeholderName} aria-label="שם" />
        <input name="email" type="email" dir="ltr" placeholder="כתובת Gmail" aria-label="מייל" required />
        <button className="pbtn" disabled={pending}>{pending ? "שולחים…" : "הזמנה"}</button>
        {state.error && <p className="error">{state.error}</p>}
      </form>
      {state.share && (
        <div className="share">
          <b>{state.share.name || state.share.email} הוזמנ/ה</b>
          <span className="txt">שלחו לו/ה את הקישור. הכניסה עם Google בכתובת {state.share.email}.</span>
          <div className="acts2">
            <a className="pbtn" href={`https://wa.me/?text=${encodeURIComponent(state.share.text)}`} target="_blank" rel="noopener">
              שליחה בוואטסאפ
            </a>
            <button className="tbtn" onClick={() => navigator.clipboard?.writeText(state.share!.text).then(() => setCopied(true))}>
              {copied ? "הועתק" : "העתקת ההודעה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// כפתור שפותח חלונית אישור לפני פעולה שאי אפשר לבטל
export function ConfirmButton({ label, title, body, confirmLabel, onConfirm, className = "danger-link" }: {
  label: React.ReactNode; title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void>; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label={title} busy={pending} role="alertdialog">
            <div className="warnic">!</div>
            <h2 className="center">{title}</h2>
            <p className="txt center big">{body}<br /><b className="danger">אי אפשר לבטל את הפעולה.</b></p>
            <div className="acts2">
              <button className="tbtn" onClick={() => setOpen(false)} disabled={pending}>ביטול</button>
              <button className="pbtn danger" disabled={pending} onClick={() => start(async () => { await onConfirm(); setOpen(false); })}>
                {pending ? "רגע…" : confirmLabel}
              </button>
            </div>
        </Sheet>
      )}
    </>
  );
}

export function ManagerPicker({ clientId, current, team }: { clientId: string; current: string | null; team: { id: string; label: string }[] }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  return (
    <div className="seg" aria-busy={pending}>
      {team.map((t) => (
        <button key={t.id} type="button" aria-pressed={value === t.id}
          onClick={() => { setValue(t.id); start(() => setClientManager(clientId, t.id)); }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// שיוך לקוחות למנהל/ת מתוך עמוד הצוות. לקוח שמוסר מהרשימה חוזר למנהלת הסטודיו
export function AssignClients({ memberId, memberName, ownerId, clients }: {
  memberId: string; memberName: string; ownerId: string; clients: { id: string; name: string; manager_id: string | null; managerName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(clients.filter((c) => c.manager_id === memberId).map((c) => c.id)));
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      for (const c of clients) {
        const was = c.manager_id === memberId;
        const now = picked.has(c.id);
        if (now && !was) await setClientManager(c.id, memberId);
        if (!now && was) await setClientManager(c.id, ownerId);
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button className="edit" onClick={() => setOpen(true)}>שיוך לקוחות</button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label={`שיוך לקוחות ל${memberName}`} busy={pending}>
            <h2>הלקוחות של {memberName}</h2>
            <p className="txt">מי שמנהל/ת את הלקוח אחראי/ת גם על ההעלאות שלו.</p>
            <div className="note soft">
              {clients.map((c) => (
                <label key={c.id} className="lnk checkrow">
                  <span>{c.name}<small>{c.manager_id === memberId ? "משויך עכשיו" : `כרגע: ${c.managerName}`}</small></span>
                  <input type="checkbox" checked={picked.has(c.id)}
                    onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                </label>
              ))}
              {clients.length === 0 && <p className="empty">עוד אין לקוחות</p>}
            </div>
            <div className="acts2">
              <button className="tbtn" onClick={() => setOpen(false)} disabled={pending}>ביטול</button>
              <button className="pbtn" onClick={save} disabled={pending}>{pending ? "שומרים…" : "שמירה"}</button>
            </div>
        </Sheet>
      )}
    </>
  );
}

export function IndustryPicker({ clientId, current }: { clientId: string; current: Industry }) {
  const [value, setValue] = useState(current);
  const [, start] = useTransition();
  return (
    <div className="seg small">
      {(Object.keys(INDUSTRY_LABEL) as Industry[]).map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => { setValue(k); start(() => setClientIndustry(clientId, k)); }}>{INDUSTRY_LABEL[k]}</button>
      ))}
    </div>
  );
}
