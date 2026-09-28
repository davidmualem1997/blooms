import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "פתיחת סטודיו · BLOOMS" };

async function createStudio(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_studio", { studio_name: name });
  if (error) throw new Error(error.message);
  redirect("/");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (
    <main className="center-screen">
      <form className="login-card" action={createStudio}>
        <h1 className="display">ברוכים הבאים</h1>
        <p className="muted">
          אם הוזמנתם על ידי סטודיו, בקשו ממנהלת הסטודיו להזמין את הכתובת <b dir="ltr">{data.user?.email}</b>.
        </p>
        <p className="muted">או פתחו סטודיו חדש:</p>
        <input name="name" placeholder="שם הסטודיו" required />
        <button className="pbtn wide">פתיחת סטודיו</button>
      </form>
    </main>
  );
}
