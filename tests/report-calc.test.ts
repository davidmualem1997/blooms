// בדיקת חישובי הדוח החודשי על חודש מדומה: npx tsx tests/report-calc.test.ts
import { computeReport, type Metric, type Post } from "@/lib/report-calc";

const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const metrics: Metric[] = [
  { platform: "instagram", month: "2026-08-01", followers: 4000, reach: 20000, views: 50000, interactions: 1500, link_clicks: 100 },
  { platform: "tiktok", month: "2026-08-01", followers: 1000, reach: 30000, views: 80000 },
  { platform: "instagram", month: "2026-09-01", followers: 4400, unfollows: 60, reach: 23600, views: 61000, interactions: 1800, link_clicks: 150 },
  { platform: "tiktok", month: "2026-09-01", followers: 1100, reach: 27000, views: 90000 },
];
const P = (id: string, type: Post["type"], time: string, stats: Post["stats"]): Post => ({ id, title: `תוכן ${id}`, type, date: "2026-09-10", time, stats, thumb: null });
const posts: Post[] = [
  P("r1", "reel", "19:00", { views: 12000, saves: 40, shares: 20 }),
  P("r2", "reel", "20:00", { views: 9000, saves: 60, shares: 30, link_clicks: 5 }),
  P("p1", "post", "11:00", { reach: 3000, saves: 10, link_clicks: 90, profile_visits: 40 }),
  P("p2", "post", "12:00", { reach: 2500, saves: 5 }),
  P("p3", "post", "10:00", { reach: 1200, saves: 2 }),
  P("x", "post", "10:00", {}),
];
const r = computeReport({ month: "2026-09-01", metrics, posts, business: { reservations: 46 }, prevBusiness: { reservations: 40 }, industry: "food" });

console.log("KPI:", r.kpis.map((k) => `${k.l}=${k.value}${k.delta != null ? ` (${k.delta}%)` : ""}`).join(" | "));
console.log("צמיחה:", r.growth);
console.log("מובילים:", r.top.map((t) => `${t.goal}: ${t.post.id} – ${t.why}`));
console.log("פחות טוב:", r.weak.map((p) => p.id));
console.log("תובנות:", r.suggestions.insights);
console.log("החודש הבא:", r.suggestions.nextSteps);

ok(r.kpis.find((k) => k.k === "reach")?.delta === 1 && r.kpis.find((k) => k.k === "views")?.delta === 16, "KPI change vs previous month (sum of platforms)");
ok(r.growth.start === 5000 && r.growth.end === 5500 && r.growth.net === 500 && r.growth.pct === 10, "followers start/end/net/% across platforms");
ok(r.kpis.find((k) => k.k === "reservations")?.delta === 15, "business KPI compares to previous month");
ok(r.top[0].post.id === "r1" && r.top[1].post.id === "r2" && r.top[2].post.id === "p1", "top by goal: exposure, saves+shares, clicks – each a different post");
ok(!r.top.some((t) => t.post.id === "x") && !r.weak.some((p) => p.id === "x"), "content without stats is not ranked");
ok(r.weak[0]?.id === "p3", "weakest = lowest exposure among the rest");
ok(r.suggestions.insights.some((s) => s.includes("רילס")), "insight: reels vs photos");
ok(r.suggestions.insights.some((s) => s.includes("בערב")), "insight: evening vs day");
ok(r.suggestions.insights.some((s) => s.includes("10%")), "insight: follower growth");
const empty = computeReport({ month: "2026-09-01", metrics: [], posts: [], business: {}, prevBusiness: {}, industry: "other" });
ok(empty.kpis.length === 0 && empty.top.length === 0 && empty.suggestions.insights.length === 0 && empty.growth.end == null, "empty month shows nothing (no fake zeros)");
