"use client";

import { mediaUrl } from "@/app/(app)/c/[clientId]/gantt/actions";

// שמירת קובץ לטלפון דרך חלון השיתוף של המערכת (שמירה לתמונות / ישר לאינסטגרם); בלי תמיכה – פותחים את הקובץ
export async function saveMedia(path: string) {
  const url = await mediaUrl(path);
  if (!url) return false;
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], path.split("/").pop() ?? "media", { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
  } catch (e) { if ((e as Error).name === "AbortError") return true; }
  window.open(url, "_blank");
  return true;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
