import { createClient } from "@/lib/supabase/server";

// הדלי פרטי, לכן מציגים קבצים דרך קישורים חתומים זמניים
export async function signPaths(paths: (string | null | undefined)[], expiresIn = 3600): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!list.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from("media").createSignedUrls(list, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
