import { getContext, memberName } from "@/lib/context";
import { todayIL } from "@/lib/dates";
import type { Brand, ClientEvent, Meeting, Message, Task } from "@/lib/types";
import { ClientFile, type FileTab } from "./client-file";
import { guessIndustry, type Industry } from "@/lib/holidays";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton, IndustryPicker, InviteForm, ManagerPicker } from "@/components/admin-ui";
import { cancelInvite, removeClientUser } from "../../../admin-actions";

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

  const tabs: FileTab[] = ["general", "brand", "ops", "events", "meetings", "contacts", "settings"];
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

  return (
    <ClientFile clientName={client.name} initialTab={initialTab} settings={settings}
      clientId={clientId} studioId={client.studio_id} brand={brand} isStaff={isStaff} isVenue={industry === "food" || industry === "retail"}
      userId={ctx.userId} images={images} today={today} events={evs}
      team={ctx.team.map((t) => ({ id: t.id, name: t.full_name || memberName(ctx, t.id) }))}
      tasks={(tasks ?? []) as Task[]} meetings={(meetings ?? []) as Meeting[]} openMessages={(openMessages ?? []) as Message[]} />
  );
}
