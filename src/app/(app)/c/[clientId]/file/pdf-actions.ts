"use server";

import { extractBrandFromPdf, type ExtractedBrand } from "@/lib/brand-extract";
import { createClient } from "@/lib/supabase/server";

// PDF שהועלה לאחסון של הלקוח → הצעה למילוי תיק הלקוח. הקובץ נמחק אחרי הקריאה.
export async function readClientPdf(clientId: string, path: string): Promise<{ data?: ExtractedBrand; error?: string }> {
  const supabase = await createClient();
  // הקובץ חייב להיות בתיקייה של הלקוח הזה; ההורדה עצמה עוברת RLS
  if (path.split("/")[1] !== clientId || !path.toLowerCase().endsWith(".pdf")) return { error: "קובץ לא תקין" };
  const { data: file, error } = await supabase.storage.from("media").download(path);
  if (error || !file) return { error: "לא הצלחנו לקרוא את הקובץ" };
  try {
    if (file.size > 25 * 1024 * 1024) return { error: "הקובץ גדול מדי (עד 25MB)" };
    const data = await extractBrandFromPdf(Buffer.from(await file.arrayBuffer()), path.split("/").pop() ?? "client.pdf");
    return { data };
  } catch (e) {
    console.error("pdf extract", (e as Error).message);
    return { error: "לא הצלחנו לקרוא את המידע מהקובץ. נסו שוב או קובץ אחר." };
  } finally {
    await supabase.storage.from("media").remove([path, path.replace(/original\.pdf$/i, "thumb.jpg")]);
  }
}
