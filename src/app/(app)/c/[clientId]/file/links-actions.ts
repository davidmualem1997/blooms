"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LINK_KINDS, normalizeTarget, slugify, type LinkKind } from "@/lib/links";
import type { Brand } from "@/lib/types";

const done = (clientId: string) => revalidatePath(`/c/${clientId}`, "layout");

// כתובת הלינק בביו: blooms…/l/<handle>
export async function setLinkHandle(clientId: string, raw: string): Promise<{ error?: string }> {
  const handle = slugify(raw);
  if (handle.length < 2) return { error: "לפחות 2 אותיות באנגלית או ספרות" };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ link_handle: handle }).eq("id", clientId);
  if (error) return { error: error.code === "23505" ? "הכתובת תפוסה – נסו אחרת" : "לא הצלחנו לשמור" };
  done(clientId);
  return {};
}

export async function saveLink(clientId: string, input: { id?: string; label: string; kind: LinkKind; target: string }): Promise<{ error?: string }> {
  const target = normalizeTarget(input.kind, input.target);
  if (!target) return { error: input.kind === "phone" || input.kind === "whatsapp" ? "מספר טלפון לא תקין" : "קישור לא תקין" };
  const label = input.label.trim() || LINK_KINDS.find((k) => k.k === input.kind)!.l;
  const supabase = await createClient();
  if (input.id) {
    const { error } = await supabase.from("links").update({ label, kind: input.kind, target }).eq("id", input.id);
    if (error) return { error: "לא הצלחנו לשמור" };
  } else {
    const { data: existing } = await supabase.from("links").select("slug").eq("client_id", clientId);
    const taken = new Set((existing ?? []).map((l) => l.slug));
    const base = input.kind === "other" ? slugify(label) || "link" : input.kind;
    let slug = base, n = 2;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    const { error } = await supabase.from("links").insert({ client_id: clientId, slug, label, kind: input.kind, target, position: taken.size });
    if (error) return { error: "לא הצלחנו לשמור" };
  }
  done(clientId);
  return {};
}

export async function deleteLink(clientId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("links").delete().eq("id", id);
  done(clientId);
}

// יצירה בלחיצה אחת מהפרטים שכבר בתיק הלקוח (הזמנת מקום, תפריט, ניווט, טלפון, אתר)
export async function linksFromClientFile(clientId: string): Promise<number> {
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("brand").eq("id", clientId).single();
  const b = (client?.brand ?? {}) as Brand;
  const wanted: { kind: LinkKind; label: string; target?: string }[] = [
    { kind: "reservation", label: "הזמנת מקום", target: b.booking?.reserve_url },
    { kind: "menu", label: "תפריט", target: b.booking?.menu_url },
    { kind: "waze", label: "ניווט ב-Waze", target: b.booking?.waze_url },
    { kind: "phone", label: "להתקשר", target: b.booking?.reserve_phone },
    { kind: "site", label: "האתר שלנו", target: b.socials?.website },
  ];
  const { data: existing } = await supabase.from("links").select("kind").eq("client_id", clientId);
  const have = new Set((existing ?? []).map((l) => l.kind));
  let created = 0;
  for (const w of wanted) if (w.target && !have.has(w.kind) && !(await saveLink(clientId, { label: w.label, kind: w.kind, target: w.target })).error) created++;
  done(clientId);
  return created;
}
