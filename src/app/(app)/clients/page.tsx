import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext, memberName } from "@/lib/context";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/admin-ui";
import { deleteClientAction } from "../admin-actions";

export const metadata = { title: "ניהול לקוחות · BLOOMS" };

// ניהול לקוחות (מנהלת הסטודיו): רשימה, כניסה לפורטל, הוספה ומחיקה
export default async function ClientsPage() {
  const ctx = await getContext();
  if (ctx.role !== "owner") notFound();
  const supabase = await createClient();
  const counts = await Promise.all(ctx.clients.map((c) => supabase.from("content_items").select("id", { count: "exact", head: true }).eq("client_id", c.id)));
  const logos = await signPaths(ctx.clients.map((c) => (c.brand as { logo_path?: string })?.logo_path));
  return (
    <div className="sec">
      <div className="sechead"><h1 className="display-title">הלקוחות</h1><Link className="pbtn" href="/clients/new">לקוח חדש</Link></div>
      <div className="note">
        {ctx.clients.map((c, i) => {
          const logo = (c.brand as { logo_path?: string })?.logo_path;
          return (
            <div key={c.id} className="member">
              <Avatar src={logo ? logos[logo] : null} name={c.name} size={44} color={c.color} />
              <div className="mbody">
                <Link href={`/c/${c.id}`}><b>{c.name}</b></Link>
                <span className="txt">מנהל/ת לקוח: {memberName(ctx, c.manager_id)} · {counts[i].count ?? 0} פריטי תוכן</span>
              </div>
              <ConfirmButton label="מחיקה" title={`למחוק את ${c.name}?`}
                body={`יימחקו ${counts[i].count ?? 0} פריטי תוכן, הגאנט, ההשראות, תיק הלקוח, הפגישות וההודעות. משתמשי הלקוח לא יוכלו להיכנס יותר.`}
                confirmLabel="כן, למחוק" onConfirm={deleteClientAction.bind(null, c.id)} />
            </div>
          );
        })}
        {!ctx.clients.length && <p className="empty">עוד אין לקוחות</p>}
      </div>
    </div>
  );
}
