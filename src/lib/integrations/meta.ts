import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIL, israelToUTC, monthRange } from "@/lib/dates";
import { decryptSecret, encryptSecret } from "./crypto";

// חיבור Meta: Instagram (חשבון עסקי/יוצר שמקושר לעמוד פייסבוק) + עמוד הפייסבוק.
// המשתמש מתחבר פעם אחת עם פייסבוק ומקבל גישה לכל העמודים שהוא מנהל – ואז בוחרים לכל לקוח את החשבון שלו.
// הרשאות קריאה בלבד: לא מפרסמים, לא עורכים ולא מוחקים כלום.

const VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v24.0";
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`;
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_manage_insights", "business_management"];

export const metaConfigured = () => Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim() && process.env.INTEGRATIONS_KEY?.trim());

export function metaAuthUrl(redirectUri: string, state: string) {
  const u = new URL(`https://www.facebook.com/${VERSION()}/dialog/oauth`);
  u.searchParams.set("client_id", process.env.META_APP_ID!.trim());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  // אפליקציה מסוג Business עם "Facebook Login for Business" עובדת עם configuration (config_id) במקום רשימת הרשאות
  const config = process.env.META_CONFIG_ID?.trim();
  if (config) u.searchParams.set("config_id", config);
  else u.searchParams.set("scope", META_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

export class GraphError extends Error {
  constructor(message: string, public code?: number) { super(message); }
}

async function graph<T>(path: string, params: Record<string, string>, token?: string): Promise<T> {
  const u = new URL(`${GRAPH()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (token) u.searchParams.set("access_token", token);
  const res = await fetch(u, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new GraphError(json.error?.message ?? `Graph ${res.status}`, json.error?.code);
  return json as T;
}

// קוד מההתחברות → הרשאה ארוכת טווח (60 יום). הרשאות העמודים שנגזרות ממנה לא פגות
export async function exchangeCode(code: string, redirectUri: string) {
  const id = process.env.META_APP_ID!.trim(), secret = process.env.META_APP_SECRET!.trim();
  const short = await graph<{ access_token: string }>("oauth/access_token", { client_id: id, client_secret: secret, redirect_uri: redirectUri, code });
  const long = await graph<{ access_token: string }>("oauth/access_token", { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token });
  return long.access_token;
}

export type MetaAccount = { pageId: string; pageName: string; pageToken: string; igId: string | null; igUsername: string | null; picture: string | null };

export async function listAccounts(userToken: string): Promise<MetaAccount[]> {
  const out: MetaAccount[] = [];
  let next: string | null = null;
  let page = await graph<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }[]; paging?: { next?: string } }>(
    "me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}", limit: "100" }, userToken);
  do {
    for (const p of page.data) out.push({
      pageId: p.id, pageName: p.name, pageToken: p.access_token,
      igId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null,
      picture: p.instagram_business_account?.profile_picture_url ?? null,
    });
    next = page.paging?.next ?? null;
    if (next) page = await (await fetch(next, { cache: "no-store" })).json();
  } while (next);
  return out;
}

export type MetaSecret = { pageId: string; pageToken: string; igId: string | null };
export const sealMeta = (s: MetaSecret) => encryptSecret(s);
export const openMeta = (c: string) => decryptSecret<MetaSecret>(c);

// ---------- סנכרון ----------

const unix = (iso: string) => String(Math.floor(Date.parse(iso) / 1000));
type InsightRow = { name: string; total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] }; values?: { value: number | Record<string, number> }[] };

// מדד אחד בכל פעם: אם מדד מסוים לא נתמך בחשבון או בגרסה – מדלגים עליו ולא מפילים את כל הסנכרון
async function accountTotal(igId: string, token: string, metric: string, since: string, until: string, extra: Record<string, string> = {}) {
  try {
    const r = await graph<{ data: InsightRow[] }>(`${igId}/insights`, { metric, period: "day", metric_type: "total_value", since: unix(since), until: unix(until), ...extra }, token);
    return r.data[0] ?? null;
  } catch (e) {
    return { error: (e as Error).message } as const;
  }
}

type MonthStats = { followers?: number; unfollows?: number; reach?: number; views?: number; interactions?: number; profile_visits?: number; link_clicks?: number };

// נתוני החודש לאינסטגרם, מתחילת החודש ועד עכשיו (או עד סוף החודש)
async function igMonth(igId: string, token: string, month: string, now: string, errors: string[]): Promise<MonthStats> {
  const [from, to] = monthRange(month);
  const since = israelToUTC(from, "00:00");
  const endOfMonth = israelToUTC(to, "23:59");
  const until = endOfMonth < now ? endOfMonth : now;
  const out: MonthStats = {};
  const map: [keyof MonthStats, string][] = [["reach", "reach"], ["views", "views"], ["interactions", "total_interactions"], ["profile_visits", "profile_views"], ["link_clicks", "website_clicks"]];
  for (const [key, metric] of map) {
    const r = await accountTotal(igId, token, metric, since, until);
    if (r && "error" in r) errors.push(`${metric}: ${r.error}`);
    else if (r?.total_value?.value != null) out[key] = r.total_value.value;
  }
  const fu = await accountTotal(igId, token, "follows_and_unfollows", since, until, { breakdown: "follow_type" });
  if (fu && !("error" in fu)) {
    const res = fu.total_value?.breakdowns?.[0]?.results ?? [];
    const unf = res.find((x) => x.dimension_values.includes("NON_FOLLOWER"))?.value;
    if (unf != null) out.unfollows = unf;
  }
  return out;
}

type Media = { id: string; caption?: string; media_type: string; media_product_type?: string; permalink?: string; timestamp: string; thumbnail_url?: string; media_url?: string };

async function mediaStats(mediaId: string, token: string) {
  const stats: Record<string, number> = {};
  const wanted: [string, string][] = [["reach", "reach"], ["views", "views"], ["likes", "likes"], ["comments", "comments"], ["saved", "saves"], ["shares", "shares"], ["profile_visits", "profile_visits"]];
  // קודם בבקשה אחת; אם נכשלה (מדד לא נתמך לסוג הזה) – אחד-אחד
  const read = (rows: InsightRow[]) => {
    for (const row of rows) {
      const key = wanted.find(([m]) => m === row.name)?.[1];
      const v = row.total_value?.value ?? (typeof row.values?.[0]?.value === "number" ? (row.values[0].value as number) : undefined);
      if (key && v != null) stats[key] = v;
    }
  };
  try {
    read((await graph<{ data: InsightRow[] }>(`${mediaId}/insights`, { metric: wanted.map(([m]) => m).join(",") }, token)).data);
  } catch {
    for (const [m] of wanted) {
      try { read((await graph<{ data: InsightRow[] }>(`${mediaId}/insights`, { metric: m }, token)).data); } catch { /* המדד לא נתמך לפוסט הזה */ }
    }
  }
  return stats;
}

const typeOf = (m: Media) => (m.media_product_type === "REELS" || m.media_type === "VIDEO" ? "reel" : "post") as "reel" | "post";

// סנכרון לקוח אחד: נתוני החודש הנוכחי והקודם, והפוסטים של 60 הימים האחרונים
export async function syncMeta(admin: SupabaseClient, integration: { id: string; client_id: string }, now = new Date().toISOString()) {
  const { data: sealed } = await admin.from("integration_secrets").select("ciphertext").eq("integration_id", integration.id).single();
  if (!sealed) throw new Error("missing credentials");
  const secret = openMeta(sealed.ciphertext);
  const errors: string[] = [];
  const today = formatIL(now).date;
  const month = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);

  // ---- אינסטגרם: נתוני חשבון
  if (secret.igId) {
    const acc = await graph<{ followers_count?: number }>(secret.igId, { fields: "followers_count" }, secret.pageToken);
    const cur = await igMonth(secret.igId, secret.pageToken, month, now, errors);
    const prev = await igMonth(secret.igId, secret.pageToken, prevMonth, now, errors);
    const rows = [
      { month, platform: "instagram", ...cur, followers: acc.followers_count ?? null },
      { month: prevMonth, platform: "instagram", ...prev }, // עוקבים בסוף החודש הקודם – רק מתמונת מצב שנשמרה אז
    ];
    for (const r of rows) {
      const values = Object.fromEntries(Object.entries(r).filter(([, v]) => v != null));
      if (Object.keys(values).length > 2) {
        await admin.from("metrics").upsert({ client_id: integration.client_id, ...values, synced_at: now }, { onConflict: "client_id,platform,month" });
      }
    }

    // ---- פוסטים: מקשרים לפריט בגאנט לפי תאריך וסוג; פוסט שלא תוכנן ב-BLOOMS נוסף כ"עלה"
    const since = unix(new Date(Date.parse(now) - 60 * 864e5).toISOString());
    const media = await graph<{ data: Media[] }>(`${secret.igId}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url", since, limit: "50" }, secret.pageToken);
    const { data: items } = await admin.from("content_items").select("id, date, type, external_id, status").eq("client_id", integration.client_id).gte("date", formatIL(new Date(Number(since) * 1000).toISOString()).date);
    const linked = new Set((items ?? []).map((i) => i.external_id).filter(Boolean));
    for (const md of media.data) {
      const stats = await mediaStats(md.id, secret.pageToken);
      const date = formatIL(md.timestamp).date;
      const time = formatIL(md.timestamp).time;
      const type = typeOf(md);
      const existing = (items ?? []).find((i) => i.external_id === md.id)
        ?? (items ?? []).find((i) => !i.external_id && !linked.has(md.id) && i.date === date && i.type === type);
      if (existing) {
        linked.add(md.id);
        existing.external_id = md.id;
        await admin.from("content_items").update({ external_id: md.id, permalink: md.permalink ?? null, stats, status: "live" }).eq("id", existing.id);
      } else {
        const title = (md.caption ?? "").split("\n")[0].slice(0, 60) || (type === "reel" ? "ריל מאינסטגרם" : "פוסט מאינסטגרם");
        await admin.from("content_items").upsert({
          client_id: integration.client_id, date, time, type, status: "live", title, caption: md.caption ?? "",
          notes: "יובא אוטומטית מאינסטגרם", external_id: md.id, permalink: md.permalink ?? null, stats,
        }, { onConflict: "client_id,external_id", ignoreDuplicates: false });
      }
    }
  }

  // ---- פייסבוק: עוקבי העמוד
  try {
    const page = await graph<{ followers_count?: number }>(secret.pageId, { fields: "followers_count" }, secret.pageToken);
    if (page.followers_count != null) {
      await admin.from("metrics").upsert({ client_id: integration.client_id, month, platform: "facebook", followers: page.followers_count, synced_at: now }, { onConflict: "client_id,platform,month" });
    }
  } catch (e) { errors.push(`facebook: ${(e as Error).message}`); }

  await admin.from("integrations").update({ status: "connected", last_sync_at: now, last_error: errors.length ? errors.slice(0, 5).join(" | ") : null }).eq("id", integration.id);
  return { errors };
}
