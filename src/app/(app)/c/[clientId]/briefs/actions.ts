"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Equipment = { text: string; who: string; done: boolean };
export type Shot = { text: string; ref?: string; feeling?: string; done?: boolean };
export type BriefInput = {
  id?: string; client_id: string; title: string; shoot_date: string | null; time_text: string; location: string;
  goal: string; feeling: string; shots: Shot[]; equipment: Equipment[];
  wardrobe: string; schedule: string; participants: string; links: string;
  vision_board?: string; status?: "draft" | "final";
};

export async function saveBrief(input: BriefInput) {
  const supabase = await createClient();
  const { id, ...row } = { ...input, title: input.title.trim() || (input.status === "draft" ? "טיוטת בריף" : "בריף צילומים") };
  const { data: auth } = await supabase.auth.getUser();
  const res = id
    ? await supabase.from("briefs").update(row).eq("id", id).select("id").single()
    : await supabase.from("briefs").insert({ ...row, created_by: auth.user?.id }).select("id").single();
  if (res.error || !res.data) throw new Error("לא הצלחנו לשמור את הבריף");
  revalidatePath(`/c/${input.client_id}`, "layout");
  redirect(`/c/${input.client_id}/briefs/${res.data.id}`);
}

export async function toggleEquipment(clientId: string, briefId: string, index: number) {
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select("equipment").eq("id", briefId).single();
  const list = ((data?.equipment ?? []) as Equipment[]).map((e, i) => (i === index ? { ...e, done: !e.done } : e));
  await supabase.from("briefs").update({ equipment: list }).eq("id", briefId);
  revalidatePath(`/c/${clientId}/briefs/${briefId}`);
}

export async function deleteBrief(clientId: string, briefId: string) {
  const supabase = await createClient();
  await supabase.from("briefs").delete().eq("id", briefId);
  revalidatePath(`/c/${clientId}`, "layout");
  redirect(`/c/${clientId}/inspiration`);
}

// סימון צילום שבוצע ביום הצילום
export async function toggleShot(clientId: string, briefId: string, index: number) {
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select("shots").eq("id", briefId).single();
  const list = ((data?.shots ?? []) as Shot[]).map((x, i) => (i === index ? { ...x, done: !x.done } : x));
  await supabase.from("briefs").update({ shots: list }).eq("id", briefId);
  revalidatePath(`/c/${clientId}/briefs/${briefId}`);
}
