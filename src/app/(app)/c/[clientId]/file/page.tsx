import { getContext, memberName } from "@/lib/context";
import { israelToUTC, parseISODate, todayIL, toISODate } from "@/lib/dates";
import type { Brand, ClientEvent, Meeting, Message, Task } from "@/lib/types";
import { ClientFile, type FileTab } from "./client-file";
import { guessIndustry, type Industry } from "@/lib/holidays";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton, IndustryPicker, InviteForm, ManagerPicker } from "@/components/admin-ui";
import { cancelInvite, removeClientUser } from "../../../admin-actions";
import { headers } from "next/headers";
import { PROVIDERS } from "@/lib/integrations/providers";
import { slugify, type LinkKind } from "@/lib/links";
import { LinksManager } from "./links-manager";
import { MetaPicker, MetaRow } from "./connections";
import { loadPendingMeta } from "./integration-actions";
import { metaConfigured } from "@/lib/integrations/meta";

const CONNECT_ERRORS: Record<string, string> = {
  "meta-not-configured": "החיבור ל-Meta עוד לא הוגדר בשרת (חסרים מפתחות האפליקציה)",
  denied: "ההתחברות בוטלה", state: "ההתחברות פגה – נסו שוב", access: "אין הרשאה ללקוח הזה",
  "no-pages": "לא נמצאו עמודים שאתם מנהלים בחשבון הפייסבוק הזה", exchange: "פייסבוק לא אישר את ההתחברות – נסו שוב", "no-code": "ההתחברות לא הושלמה",
};

export default async function ClientFilePage({ params, searchParams }: PageProps<"/c/[clientId]/file">) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const client = ctx.clients.find((c) => c.id === clientId)!;
  const today = todayIL();

  const supabase = await createClient();
  const isOwner = ctx.role === "owner";
  const isStaff = ctx.role !== "client";
  const [{ data: tasks }, { data: meetings }, { data: openMessages }, { data: events }] = await Promise.all([
    isStaff ? supabase.from("tasks").select("id, title, assignee_id, done").eq("client_id", clientId).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("meetings").select("id, kind, starts_at, location, extra_topics, summary").eq("client_id", clientId).order("starts_at"),
    supabase.from("messages").select("*").eq("client_id", clientId).or("status.eq.to_meeting,and(kind.eq.call,status.neq.done)").order("created_at"),
    supabase.from("client_events").select("*").eq("client_id", clientId).gte("date", today).order("date"),
  ]);
  const brand = (client.brand ?? {}) as Brand;
  const evs = (events ?? []) as ClientEvent[];
  const images = await signPaths([brand.cover_path, brand.logo_path, ...(brand.elements ?? []), ...evs.flatMap((e) => (e.images ?? []).map((i) => i.thumb))]);
  const industry = (brand.industry as Industry) || guessIndustry([client.name, brand.story, brand.audience].join(" "));

  const tabs: FileTab[] = ["general", "brand", "ops", "events", "meetings", "contacts", "connections", "settings"];
  const initialTab = tabs.includes(sp.tab as FileTab) && (sp.tab !== "settings" || isOwner) ? (sp.tab as FileTab) : "general";
  let settings: React.ReactNode = undefined;
  if (isOwner) {
    const [{ data: users }, { data: pending }] = await Promise.all([
      supabase.from("client_users").select("user_id, profiles(full_name, email)").eq("client_id", clientId),
      supabase.from("invites").select("id, email, full_name").eq("client_id", clientId).is("accepted_at", null),
    ]);
    settings = (
      <>
      <section className="sec" id="settings">
        <div className="sechead"><div className="label dotted">הגדרות לקוח</div><span className="txt">רק למנהלת הסטודיו</span></div>
        <div className="card stack">
          <div className="field">
            <span className="label">מנהל/ת לקוח · אחראי/ת גם על ההעלאות</span>
            <ManagerPicker clientId={clientId} current={client.manager_id}
              team={ctx.team.map((t) => ({ id: t.id, label: (t.full_name || memberName(ctx, t.id)) + (t.id === ctx.userId ? " (את)" : "") }))} />
            {ctx.team.length < 2 && <span className="txt">כדי לשייך למישהו אחר, קודם <a className="edit" href="/team">מזמינים אותו לצוות</a>.</span>}
          </div>
          <div className="field">
            <span className="label">תחום · קובע אילו ימים מיוחדים יופיעו בלוח</span>
            <IndustryPicker clientId={clientId} current={industry} />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="label dotted">משתמשי לקוח</div>
        <div className="note">
          {(users ?? []).map((u) => {
            const p = u.profiles as unknown as { full_name: string; email: string };
            return (
              <div key={u.user_id} className="lnk">
                <span>{p.full_name || p.email}<small>{p.email}</small></span>
                <ConfirmButton label="הסרה" title={`להסיר את ${p.full_name || p.email}?`}
                  body={`הגישה לפורטל של ${client.name} תיחסם.`} confirmLabel="כן, להסיר"
                  onConfirm={removeClientUser.bind(null, clientId, u.user_id)} />
              </div>
            );
          })}
          {(pending ?? []).map((p) => (
            <div key={p.id} className="lnk">
              <span>{p.full_name || p.email}<small>{p.email} · ממתין/ה לכניסה ראשונה</small></span>
              <form action={cancelInvite.bind(null, p.id)}><button className="danger-link">ביטול</button></form>
            </div>
          ))}
          {!users?.length && !pending?.length && <p className="empty">עוד אין משתמשי לקוח</p>}
        </div>
        <div className="card"><InviteForm clientId={clientId} placeholderName="שם (למשל: נועה)" /></div>
      </section>
      </>
    );
  }

  // ---- חיבורים: קישורי BLOOMS (עם לחיצות ב-30 הימים האחרונים) ומקורות נתונים
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const since = israelToUTC(toISODate(new Date(parseISODate(today).getTime() - 30 * 864e5)), "00:00");
  const [{ data: clientRow }, { data: links }, { data: clicks }, { data: integrations }] = await Promise.all([
    supabase.from("clients").select("link_handle").eq("id", clientId).single(),
    supabase.from("links").select("id, slug, label, kind, target").eq("client_id", clientId).order("position"),
    supabase.from("link_clicks").select("link_id").eq("client_id", clientId).gte("clicked_at", since),
    supabase.from("integrations").select("provider, external_name, status, last_sync_at, last_error").eq("client_id", clientId),
  ]);
  const pendingMeta = typeof sp.meta === "string" ? await loadPendingMeta(clientId, sp.meta) : null;
  const igHandle = (brand.socials?.instagram ?? "").replace(/^.*instagram\.com\//, "").replace(/[@/]/g, "").toLowerCase();
  const count = (id: string) => (clicks ?? []).filter((c) => c.link_id === id).length;
  const connections = (
    <>
      <section className="sec">
        <div className="sechead"><div className="label dotted">קישורי BLOOMS</div><span className="txt">כל לחיצה נספרת בדוח החודשי</span></div>
        <LinksManager clientId={clientId} base={base} handle={clientRow?.link_handle ?? null} isStaff={isStaff}
          suggestedHandle={slugify(brand.socials?.instagram?.replace(/^.*instagram\.com\//, "").replace(/^@/, "") ?? "") || ""}
          links={(links ?? []).map((l) => ({ ...l, kind: l.kind as LinkKind, clicks: count(l.id) }))} />
      </section>
      <section className="sec">
        <div className="label dotted">מקורות נתונים</div>
        {typeof sp.err === "string" && (
          <div className="card stack tight">
            <p className="error">{CONNECT_ERRORS[sp.err] ?? "החיבור נכשל"}</p>
            {sp.err === "no-pages" && (
              <span className="txt">
                {typeof sp.missing === "string" && sp.missing
                  ? `פייסבוק לא אישר את ההרשאות: ${sp.missing}. בחלון ההתחברות צריך לאשר את כולן.`
                  : "בחלון ההתחברות של פייסבוק צריך לסמן את העמודים של הלקוחות (\"בחירת עמודים\"). אם הם לא מופיעים שם – החשבון הזה עוד לא מנהל אותם."}
              </span>
            )}
          </div>
        )}
        {pendingMeta && typeof sp.meta === "string" && <MetaPicker clientId={clientId} pendingId={sp.meta} accounts={pendingMeta} suggested={igHandle} />}
        <div className="note">
          {PROVIDERS.map((pr) => {
            const on = (integrations ?? []).find((i) => i.provider === pr.k);
            return (
              <div key={pr.k} className="conn">
                <b className="w500">{pr.l}</b>
                {pr.k === "meta"
                  ? (on ? null : <MetaRow clientId={clientId} connected={false} canConnect={metaConfigured()} />)
                  : <span className="txt">{on ? `מחובר · ${on.external_name}` : "בקרוב"}</span>}
                <small>{pr.gives}</small>
                {pr.k === "meta" && on && <MetaRow clientId={clientId} connected name={on.external_name} status={on.status} lastSync={on.last_sync_at} lastError={on.last_error} canConnect />}
              </div>
            );
          })}
        </div>
        <span className="txt">מה שלא מחובר – מזינים ידנית בדוח החודשי. החיבורים לקריאה בלבד: BLOOMS לא מפרסם ולא משנה כלום בחשבונות.</span>
      </section>
    </>
  );

  return (
    <ClientFile clientName={client.name} initialTab={initialTab} settings={settings} connections={connections}
      clientId={clientId} studioId={client.studio_id} brand={brand} isStaff={isStaff} isVenue={industry === "food" || industry === "retail"}
      userId={ctx.userId} images={images} today={today} events={evs}
      team={ctx.team.map((t) => ({ id: t.id, name: t.full_name || memberName(ctx, t.id) }))}
      tasks={(tasks ?? []) as Task[]} meetings={(meetings ?? []) as Meeting[]} openMessages={(openMessages ?? []) as Message[]} />
  );
}
