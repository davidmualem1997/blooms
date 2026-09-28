"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";

// פעולות של מנהלת הסטודיו. RLS ופונקציות ה-DB אוכפים את ההרשאה בפועל;
// הבדיקה כאן רק מחזירה הודעה ברורה במקום שגיאה כללית.

export type InviteState = { ok?: boolean; error?: string; share?: { name: string; email: string; text: string } };

const COLORS = ["#C4532D", "#3F7FA6", "#8B7CF6", "#5AA9A0", "#E0845A", "#C97BA0", "#6C8EAD", "#7A9A3A"];

async function ownerContext() {
  const ctx = await getContext();
  if (ctx.role !== "owner" || !ctx.studioId) throw new Error("רק מנהלת הסטודיו יכולה לעשות את זה");
  return ctx;
}

async function appOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function inviteText(name: string, email: string, studio: string, forClient: string | null, url: string) {
  const who = name ? `היי ${name}! ` : "היי! ";
  const what = forClient ? `פתחתי לך גישה לפורטל של ${forClient} ב${studio}.` : `צירפתי אותך לצוות של ${studio}.`;
  return `${who}${what}\nנכנסים כאן עם חשבון Google של ${email}:\n${url}`;
}

export async function createClientAction(formData: FormData) {
  const ctx = await ownerContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const managerId = String(formData.get("manager") ?? ctx.userId);
  const handle = String(formData.get("handle") ?? "").trim().replace(/^@/, "");
  const { data, error } = await supabase
    .from("clients")
    .insert({
      studio_id: ctx.studioId,
      name,
      ig_handle: handle,
      color: COLORS[ctx.clients.length % COLORS.length],
      manager_id: managerId,
      brand: {
        industry: String(formData.get("industry") ?? "other"),
        ...(handle ? { socials: { instagram: `https://www.instagram.com/${handle}/` } } : {}),
      },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "לא הצלחנו ליצור את הלקוח");
  revalidatePath("/", "layout");
  redirect(`/c/${data.id}/file`);
}

export async function setClientManager(clientId: string, managerId: string) {
  await ownerContext();
  const supabase = await createClient();
  await supabase.from("clients").update({ manager_id: managerId }).eq("id", clientId);
  revalidatePath("/", "layout");
}

export async function setClientIndustry(clientId: string, industry: string) {
  await ownerContext();
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("brand").eq("id", clientId).single();
  await supabase.from("clients").update({ brand: { ...((data?.brand as object) ?? {}), industry } }).eq("id", clientId);
  revalidatePath("/", "layout");
}

// כל הקבצים של לקוח באחסון: <studio>/<client>/<תיקייה>/<קובץ>
async function removeClientFiles(supabase: Awaited<ReturnType<typeof createClient>>, studioId: string, clientId: string) {
  const root = `${studioId}/${clientId}`;
  const { data: folders } = await supabase.storage.from("media").list(root, { limit: 1000 });
  const paths: string[] = [];
  for (const f of folders ?? []) {
    if (f.id) { paths.push(`${root}/${f.name}`); continue; } // קובץ ישירות בתיקיית הלקוח
    const { data: files } = await supabase.storage.from("media").list(`${root}/${f.name}`, { limit: 100 });
    for (const file of files ?? []) paths.push(`${root}/${f.name}/${file.name}`);
  }
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from("media").remove(paths.slice(i, i + 100));
}

// מחיקת לקוח: קבצים, כל הנתונים, ומשתמשי לקוח שלא נשאר להם תפקיד אחר
export async function deleteClientAction(clientId: string) {
  const ctx = await ownerContext();
  const supabase = await createClient();
  const client = ctx.clients.find((c) => c.id === clientId);
  if (!client) return;
  await removeClientFiles(supabase, client.studio_id, clientId);
  const { error } = await supabase.rpc("delete_client", { p_client: clientId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/clients");
}

export async function inviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await ownerContext();
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const clientId = (formData.get("client") as string) || null;
  const role = clientId ? "client" : "manager";
  const { error } = await supabase.rpc("invite_member", {
    p_studio: ctx.studioId,
    p_email: email,
    p_name: name,
    p_role: role,
    p_client: clientId,
  });
  if (error) {
    const m = error.message;
    return {
      error: /invalid email/.test(m) ? "כתובת המייל לא תקינה"
        : /already a team member/.test(m) ? "המייל הזה שייך למישהו מהצוות. כדי להזמין אותו כלקוח, קודם מסירים אותו בעמוד ניהול צוות."
        : /already a client user/.test(m) ? "המייל הזה שייך למשתמש/ת לקוח. כדי לצרף לצוות, קודם מסירים אותו/ה מהלקוח."
        : "לא הצלחנו לשלוח הזמנה. נסו שוב.",
    };
  }
  revalidatePath("/", "layout");
  const client = clientId ? ctx.clients.find((c) => c.id === clientId)?.name ?? null : null;
  const url = await appOrigin();
  return {
    ok: true,
    share: { name, email, text: inviteText(name, email, ctx.studioName || "הסטודיו", client, url) },
  };
}

// הסרת משתמש/ת לקוח; אם לא נשאר תפקיד אחר – נמחק/ת לגמרי (במסד הנתונים)
export async function removeClientUser(clientId: string, userId: string) {
  await ownerContext();
  const supabase = await createClient();
  await supabase.rpc("remove_client_user", { p_client: clientId, p_user: userId });
  revalidatePath("/", "layout");
}

export async function cancelInvite(inviteId: string) {
  await ownerContext();
  const supabase = await createClient();
  await supabase.from("invites").delete().eq("id", inviteId);
  revalidatePath("/", "layout");
}

export async function removeManagerAction(userId: string) {
  const ctx = await ownerContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_manager", { p_studio: ctx.studioId, p_user: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
