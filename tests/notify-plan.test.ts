// בדיקת כללי ההתראות על יום מדומה: npx tsx tests/notify-plan.test.ts
import { israelToUTC } from "@/lib/dates";
import { planNotifications, type Snapshot } from "@/lib/notify-plan";

const DAY = "2026-10-19"; // יום שני, יום לפני הגשת התוכנית (ה־20)
const at = (d: string, t: string) => Date.parse(israelToUTC(d, t));
const NAMES: Record<string, string> = { Y: "יולי (מנהלת)", G: "גל (מנהלת לקוח A)", NA: "נועה (לקוח A)", NB: "הדס (לקוח B)" };

const s: Snapshot = {
  clients: [
    { id: "A", name: "ל׳פיצהלה", studio_id: "S", manager_id: "G" },
    { id: "B", name: "הפיש גארדן", studio_id: "S", manager_id: "Y" },
  ],
  owners: [{ studio_id: "S", user_id: "Y" }],
  clientUsers: [{ client_id: "A", user_id: "NA" }, { client_id: "B", user_id: "NB" }],
  items: [
    { id: "a1", client_id: "A", date: DAY, time: "12:00:00", type: "post", title: "פיצה חדשה", caption: "טקסט", status: "ok", media: [1] },
    { id: "a2", client_id: "A", date: DAY, time: null, type: "reel", title: "מאחורי הקלעים", caption: "", status: "ok", media: [] },
    { id: "a3", client_id: "A", date: "2026-10-25", time: null, type: "post", title: "מבצע", caption: "x", status: "client", media: [1] },
    { id: "a4", client_id: "A", date: "2026-10-26", time: null, type: "reel", title: "ריל", caption: "x", status: "client", media: [1] },
    { id: "n1", client_id: "A", date: "2026-11-03", time: null, type: "post", title: "נובמבר", caption: "x", status: "client", media: [1] },
    { id: "b1", client_id: "B", date: "2026-10-18", time: null, type: "post", title: "דג השבוע", caption: "x", status: "ok", media: [1] },
    { id: "b2", client_id: "B", date: "2026-10-22", time: null, type: "post", title: "תפריט", caption: "x", status: "review", media: [1] },
    { id: "b3", client_id: "B", date: "2026-10-19", time: null, type: "post", title: "עלה כבר", caption: "x", status: "live", media: [1] },
  ],
  recurring: [{ client_id: "A", weekdays: [1, 3] }],
  oneOff: [],
  messages: [{ id: "m1", client_id: "A", created_at: new Date(at(DAY, "09:00") - 3 * 864e5).toISOString() }],
  meetings: [{ id: "mt1", client_id: "B", starts_at: israelToUTC(DAY, "14:00"), location: "בית הקפה" }],
  teamMeetings: [{ id: "tm1", studio_id: "S", starts_at: israelToUTC(DAY, "16:00"), location: "זום", attendee_ids: ["G"] }],
  events: [{ id: "e1", client_id: "A", date: "2026-10-21", title: "ערב טעימות", needs_material: true }],
};

const logged = new Set<string>();
for (const t of ["07:00", "08:05", "09:05", "10:05", "11:15", "12:35", "13:05", "15:05", "18:05", "20:05", "21:00", "22:00"]) {
  const planned = planNotifications(s, at(DAY, t), logged);
  console.log(`\n=== ${t} ${planned.length ? "" : "(כלום)"}`);
  for (const p of planned) {
    p.claims.forEach((k) => logged.add(k)); // כאילו נשלח
    console.log(`→ ${p.to.map((u) => NAMES[u]).join(", ")}\n   ${p.title}: ${p.body.replace(/\n/g, "\n   ")}\n   ⤷ ${p.url}`);
  }
}

// יום לפני סוף מועד האישור: תזכורת אחת ללקוח
const s2 = { ...s, items: [...s.items, { id: "x1", client_id: "B", date: "2026-11-05", time: null, type: "post" as const, title: "x", caption: "x", status: "client", media: [1] }] };
const log2 = new Set(["approve:x1", "approve:n1", "approve:a3", "approve:a4"]);
console.log("\n=== 30.10 10:05 (תזכורת אישור)");
for (const p of planNotifications(s2, at("2026-10-30", "10:05"), log2).filter((p) => p.tag === "approve-remind")) console.log(`→ ${p.to.map((u) => NAMES[u]).join(", ")} | ${p.title}: ${p.body}`);
