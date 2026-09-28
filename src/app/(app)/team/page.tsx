import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { AssignClients, ConfirmButton, InviteForm } from "@/components/admin-ui";
import { memberName } from "@/lib/context";
import { cancelInvite, removeManagerAction } from "../admin-actions";

export const metadata = { title: "צוות · BLOOMS" };

export default async function TeamPage() {
  const ctx = await getContext();
  if (ctx.role !== "owner") notFound();
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("invites").select("id, email, full_name").eq("role", "manager").is("accepted_at", null).order("created_at");

  return (
    <div className="sec">
      <h1 className="page-title">הצוות</h1>
      <div className="note">
        {ctx.team.map((t) => {
          const theirs = ctx.clients.filter((c) => c.manager_id === t.id);
          return (
            <div key={t.id} className="member">
              <div className="mav">{(t.full_name || "?")[0]}</div>
              <div className="mbody">
                <b>{t.full_name || "ללא שם"}</b>
                <span className="txt">{t.role === "owner" ? "מנהלת הסטודיו · גם מנהלת לקוחות" : "מנהל/ת לקוחות"}</span>
                <div className="mcl">
                  {theirs.map((c) => <span key={c.id} className="tag">{c.name}</span>)}
                  {t.role === "manager" && (
                    <AssignClients memberId={t.id} memberName={t.full_name || "מנהל/ת הלקוחות"} ownerId={ctx.userId}
                      clients={ctx.clients.map((c) => ({ id: c.id, name: c.name, manager_id: c.manager_id, managerName: memberName(ctx, c.manager_id) }))} />
                  )}
                </div>
              </div>
              {t.role === "manager" ? (
                <ConfirmButton label="הסרה" title={`להסיר את ${t.full_name || "המשתמש/ת"} מהצוות?`}
                  body={`${theirs.length ? `${theirs.length} הלקוחות שלו/ה יעברו אלייך. ` : ""}הגישה שלו/ה לאפליקציה תיחסם.`}
                  confirmLabel="כן, להסיר" onConfirm={removeManagerAction.bind(null, t.id)} />
              ) : <span />}
            </div>
          );
        })}
        {(pending ?? []).map((p) => (
          <div key={p.id} className="member">
            <div className="mav pending">?</div>
            <div className="mbody"><b>{p.full_name || p.email}</b><span className="txt" dir="ltr">{p.email} · ממתין/ה לכניסה ראשונה</span></div>
            <form action={cancelInvite.bind(null, p.id)}><button className="danger-link">ביטול</button></form>
          </div>
        ))}
      </div>
      <section className="sec">
        <div className="label dotted">הוספת מנהל/ת לקוחות</div>
        <div className="card"><InviteForm placeholderName="שם (למשל: גל)" /></div>
      </section>
    </div>
  );
}
