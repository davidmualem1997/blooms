"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { previewImageFor } from "@/lib/link-preview";
import { notifyLater } from "@/lib/push";
import type { Attachment, MessageKind, RequestStatus } from "@/lib/types";

const excerpt = (s: string, n = 90) => (s.trim().length > n ? s.trim().slice(0, n) + "…" : s.trim());

function done(clientId: string) {
  revalidatePath(`/c/${clientId}`, "layout");
  revalidatePath("/");
}

// פנייה חדשה מהלקוח. רעיון לתוכן נשמר גם בהשראה (כ"רעיון לקוח")
export async function sendRequest(clientId: string, kind: MessageKind, body: string, attachments: Attachment[] = []): Promise<{ error?: string }> {
  if (!body.trim()) return {};
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("messages").insert({
    client_id: clientId, kind, body: body.trim(), attachments, created_by: auth.user?.id,
    status: kind === "call" ? "to_meeting" : "new",
  });
  if (error) return { error: "הפנייה לא נשלחה. נסו שוב." };
  if (kind === "idea") notifyLater({ clientId, who: "team" }, { body: `רעיון חדש: ${excerpt(body)}`, url: `/c/${clientId}/inspiration`, tag: `idea-${clientId}` }, auth.user?.id);
  else notifyLater({ clientId, who: "manager" }, { body: `${kind === "fix" ? "בקשת תיקון" : "פנייה חדשה"}: ${excerpt(body)}`, url: `/c/${clientId}/requests`, tag: `req-${clientId}` }, auth.user?.id);
  if (kind === "idea") {
    const url = body.match(/https?:\/\/\S+/)?.[0] ?? "";
    const title = body.replace(url, "").trim() || "רעיון מהלקוח";
    const { data: client } = await supabase.from("clients").select("studio_id").eq("id", clientId).single();
    const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()).split("-").map(Number);
    const month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // החודש הבא
    const image_path = url && client ? await previewImageFor(url, client.studio_id, clientId) : null;
    await supabase.from("ideas").insert({
      client_id: clientId, month, title: title.slice(0, 80), note: title.length > 80 ? title : "", url, image_path,
      source: "client", created_by: auth.user?.id,
    });
  }
  done(clientId);
  return {};
}

// הצוות: שינוי סטטוס ותשובה קצרה בתוך הפנייה
export async function updateRequest(clientId: string, id: string, patch: { status?: RequestStatus; reply?: string }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.status === "done") update.resolved_by = auth.user?.id;
  if (patch.reply?.trim()) {
    const { data } = await supabase.from("messages").select("replies").eq("id", id).single();
    update.replies = [...((data?.replies ?? []) as unknown[]), { author_id: auth.user?.id, text: patch.reply.trim(), at: new Date().toISOString() }];
    if (!patch.status) update.status = "in_progress";
  }
  if (Object.keys(update).length) {
    const { data: msg } = await supabase.from("messages").update(update).eq("id", id).select("created_by, body").single();
    // מי ששלח את הפנייה מקבל עדכון כשעונים לו או כשהפנייה טופלה
    const about = excerpt(msg?.body ?? "", 40);
    const text = patch.reply?.trim() || patch.status === "done" || patch.status === "to_meeting" ? `הצוות עדכן את הפנייה שלך לגבי "${about}"` : "";
    if (msg?.created_by && text) notifyLater({ userIds: [msg.created_by], clientId }, { body: text, url: `/c/${clientId}/requests`, tag: `reply-${id}` }, auth.user?.id);
  }
  done(clientId);
}
