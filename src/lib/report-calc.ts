import type { Industry } from "@/lib/holidays";
import type { ContentType } from "@/lib/types";

// חישובי הדוח החודשי – פונקציות טהורות (בלי מסד נתונים), כדי שאפשר לבדוק אותן

export type Platform = "instagram" | "facebook" | "tiktok";
export const PLATFORMS: { k: Platform; l: string }[] = [
  { k: "instagram", l: "אינסטגרם" },
  { k: "facebook", l: "פייסבוק" },
  { k: "tiktok", l: "טיקטוק" },
];

export const METRIC_FIELDS = [
  { k: "followers", l: "עוקבים בסוף החודש" },
  { k: "unfollows", l: "הפסיקו לעקוב" },
  { k: "reach", l: "חשיפה" },
  { k: "views", l: "צפיות" },
  { k: "interactions", l: "מעורבות (אינטראקציות)" },
  { k: "profile_visits", l: "כניסות לפרופיל" },
  { k: "link_clicks", l: "קליקים לקישור" },
] as const;
export type MetricKey = (typeof METRIC_FIELDS)[number]["k"];
export type Metric = { platform: Platform; month: string } & Partial<Record<MetricKey, number | null>>;

export const POST_STATS = [
  { k: "reach", l: "חשיפה" },
  { k: "views", l: "צפיות" },
  { k: "likes", l: "לייקים" },
  { k: "saves", l: "שמירות" },
  { k: "shares", l: "שיתופים" },
  { k: "comments", l: "תגובות" },
  { k: "profile_visits", l: "כניסות לפרופיל" },
  { k: "link_clicks", l: "קליקים" },
] as const;
export type Stats = Partial<Record<(typeof POST_STATS)[number]["k"], number>>;
export type Post = { id: string; title: string; type: ContentType; date: string; time: string | null; stats: Stats; thumb: string | null };

// תוצאה עסקית לפי תחום. הראשון בכל רשימה הוא ה-KPI העסקי שמופיע למעלה
type BizField = { k: string; l: string; money?: boolean; pct?: boolean };
const SERVICE: BizField[] = [
  { k: "leads", l: "לידים" }, { k: "forms", l: "טפסים שמולאו" }, { k: "calls", l: "שיחות טלפון" },
  { k: "meetings", l: "פגישות שנקבעו" }, { k: "new_clients", l: "לקוחות חדשים" },
];
const SHOP: BizField[] = [
  { k: "revenue", l: "הכנסות", money: true }, { k: "orders", l: "הזמנות" }, { k: "conversion", l: "יחס המרה", pct: true },
  { k: "social_orders", l: "הזמנות מהסושיאל" },
];
export const BUSINESS_FIELDS: Record<Industry, BizField[]> = {
  food: [
    { k: "reservations", l: "הזמנות מקום" }, { k: "waze", l: "קליקים לניווט (Waze)" }, { k: "menu", l: "קליקים לתפריט" },
    { k: "calls", l: "שיחות טלפון" }, { k: "site_sales", l: "מכירות באתר", money: true },
  ],
  retail: SHOP, fashion: SHOP, beauty: SERVICE, fitness: SERVICE, other: SERVICE,
};

const sum = (xs: (number | null | undefined)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);
export const pctChange = (now: number | null, prev: number | null) => (now == null || prev == null || prev === 0 ? null : Math.round(((now - prev) / prev) * 100));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const exposure = (s: Stats) => s.views ?? s.reach ?? 0;
const keeps = (s: Stats) => (s.saves ?? 0) + (s.shares ?? 0);
const clicks = (s: Stats) => (s.link_clicks ?? 0) + (s.profile_visits ?? 0);
// "40% יותר" / "פי 3 יותר" – מעל הכפלה קל יותר לקרוא "פי"
const more = (pct: number) => (pct >= 100 ? `פי ${Math.round((pct / 100 + 1) * 10) / 10}` : `${pct}%`);
const hasStats = (p: Post) => Object.values(p.stats ?? {}).some((v) => (v ?? 0) > 0);

export type Kpi = { k: string; l: string; value: number; delta: number | null; money?: boolean; pct?: boolean };

export function computeReport(input: { month: string; metrics: Metric[]; posts: Post[]; business: Record<string, number>; prevBusiness: Record<string, number>; industry: Industry }) {
  const { month, metrics, posts, business, prevBusiness, industry } = input;
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10); })();
  const cur = metrics.filter((m) => m.month === month);
  const prev = metrics.filter((m) => m.month === prevMonth);
  const total = (rows: Metric[], k: MetricKey) => sum(rows.map((r) => r[k]));

  // ---- צמיחה בקהל: עוקבים בתחילת החודש = סוף החודש הקודם (רק פלטפורמות שיש להן את שני הנתונים)
  const both = PLATFORMS.map((p) => ({ p, now: cur.find((r) => r.platform === p.k)?.followers ?? null, before: prev.find((r) => r.platform === p.k)?.followers ?? null }));
  const withBoth = both.filter((b) => b.now != null && b.before != null);
  const followersEnd = sum(cur.map((r) => r.followers));
  const followersStart = withBoth.length ? withBoth.reduce((a, b) => a + b.before!, 0) : null;
  const net = withBoth.length ? withBoth.reduce((a, b) => a + (b.now! - b.before!), 0) : null;
  const growth = {
    start: followersStart,
    end: followersEnd,
    net,
    unfollows: total(cur, "unfollows"),
    pct: followersStart ? Math.round(((net ?? 0) / followersStart) * 1000) / 10 : null,
    perPlatform: both.filter((b) => b.now != null),
  };
  // היסטוריית עוקבים (סך כל הפלטפורמות) לגרף
  const months = [...new Set(metrics.filter((m) => m.followers != null).map((m) => m.month))].sort().filter((m) => m <= month).slice(-6);
  const history = months.map((m) => ({ month: m, followers: sum(metrics.filter((r) => r.month === m).map((r) => r.followers)) ?? 0 }));

  // ---- תמונת מצב: מציגים רק KPI שיש להם נתון
  const biz = BUSINESS_FIELDS[industry];
  const kpis: Kpi[] = [
    { k: "reach", l: "חשיפה", value: total(cur, "reach"), delta: pctChange(total(cur, "reach"), total(prev, "reach")) },
    { k: "views", l: "צפיות", value: total(cur, "views"), delta: pctChange(total(cur, "views"), total(prev, "views")) },
    { k: "interactions", l: "מעורבות", value: total(cur, "interactions"), delta: pctChange(total(cur, "interactions"), total(prev, "interactions")) },
    { k: "net", l: "עוקבים חדשים", value: net, delta: null },
    { k: "link_clicks", l: "קליקים לאתר", value: total(cur, "link_clicks"), delta: pctChange(total(cur, "link_clicks"), total(prev, "link_clicks")) },
    { k: biz[0].k, l: biz[0].l, value: business[biz[0].k] ?? null, delta: pctChange(business[biz[0].k] ?? null, prevBusiness[biz[0].k] ?? null), money: biz[0].money, pct: biz[0].pct },
  ].filter((x): x is Kpi => x.value != null);

  // ---- ביצועי התוכן: הכי טוב לפי מטרה, לא רק לפי לייקים
  const measured = posts.filter(hasStats);
  const pick = (score: (s: Stats) => number, taken: Set<string>) =>
    measured.filter((p) => !taken.has(p.id) && score(p.stats) > 0).sort((a, b) => score(b.stats) - score(a.stats))[0];
  const taken = new Set<string>();
  const top: { goal: string; why: string; post: Post }[] = [];
  for (const [goal, score, why] of [
    ["חשיפה", exposure, (s: Stats) => `${fmt(exposure(s))} ${s.views != null ? "צפיות" : "חשיפות"}`],
    ["שמירות ושיתופים", keeps, (s: Stats) => `${fmt(s.saves ?? 0)} שמירות · ${fmt(s.shares ?? 0)} שיתופים`],
    ["הקלקות", clicks, (s: Stats) => `${fmt(s.link_clicks ?? 0)} קליקים · ${fmt(s.profile_visits ?? 0)} כניסות לפרופיל`],
  ] as const) {
    const p = pick(score, taken);
    if (p) { taken.add(p.id); top.push({ goal, why: why(p.stats), post: p }); }
  }
  // עבד פחות טוב: החשיפה הנמוכה ביותר, מתוך מה שיש לו נתונים ולא נבחר למעלה
  const weak = measured.length >= 4 ? measured.filter((p) => !taken.has(p.id)).sort((a, b) => exposure(a.stats) - exposure(b.stats)).slice(0, 2) : [];

  // ---- תובנות מהנתונים (הצעות – הצוות עורך לפני פרסום)
  const insights: string[] = [];
  const nextSteps: string[] = [];
  const reels = measured.filter((p) => p.type !== "post").map((p) => exposure(p.stats));
  const photos = measured.filter((p) => p.type === "post").map((p) => exposure(p.stats));
  if (reels.length >= 2 && photos.length >= 2) {
    const diff = pctChange(avg(reels), avg(photos));
    if (diff != null && Math.abs(diff) >= 15) {
      insights.push(diff > 0 ? `רילס ווידאו קיבלו ${more(diff)} יותר צפיות מפוסטים של תמונה` : `פוסטים של תמונה קיבלו ${more(-diff)} יותר חשיפה מרילס`);
      nextSteps.push(diff > 0 ? "יותר רילס – הפורמט שמביא הכי הרבה חשיפה" : "לשמור על פוסטי תמונה חזקים לצד הרילס");
    }
  }
  const timed = measured.filter((p) => p.time);
  const evening = timed.filter((p) => Number(p.time!.slice(0, 2)) >= 17).map((p) => keeps(p.stats));
  const day = timed.filter((p) => Number(p.time!.slice(0, 2)) < 17).map((p) => keeps(p.stats));
  if (evening.length >= 2 && day.length >= 2) {
    const diff = pctChange(avg(evening), avg(day));
    if (diff != null && Math.abs(diff) >= 20) {
      insights.push(diff > 0 ? `פוסטים שעלו בערב קיבלו ${more(diff)} יותר שמירות ושיתופים` : `פוסטים שעלו במהלך היום קיבלו ${more(-diff)} יותר שמירות ושיתופים`);
      nextSteps.push(diff > 0 ? "לפרסם את התכנים החשובים בערב" : "לפרסם את התכנים החשובים במהלך היום");
    }
  }
  const clicker = top.find((t) => t.goal === "הקלקות");
  if (clicker) {
    insights.push(`"${clicker.post.title}" הביא הכי הרבה הקלקות החודש`);
    nextSteps.push(`להמשיך את הקו של "${clicker.post.title}"`);
  }
  if (growth.pct != null && growth.pct !== 0) insights.push(growth.pct > 0 ? `עלייה של ${growth.pct}% בעוקבים החודש` : `ירידה של ${-growth.pct}% בעוקבים החודש`);
  const reachDelta = kpis.find((k) => k.k === "reach")?.delta;
  if (reachDelta != null && Math.abs(reachDelta) >= 10) insights.push(`החשיפה ${reachDelta > 0 ? "עלתה" : "ירדה"} ב־${Math.abs(reachDelta)}% לעומת החודש הקודם`);

  return { kpis, growth, history, top, weak, measured, suggestions: { insights: insights.slice(0, 4), nextSteps: nextSteps.slice(0, 3) } };
}

export const fmt = (n: number) => new Intl.NumberFormat("he-IL", { notation: n >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
