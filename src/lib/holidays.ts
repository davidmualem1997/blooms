// חגים ומועדים ישראליים (מחושבים מהלוח העברי), ימים בינלאומיים לשיווק,
// וימים מיוחדים לפי התחום של הלקוח. הכול מחושב – אין צורך לעדכן כל שנה.

export type CalEvent = { date: string; title: string; kind: "holiday" | "memorial" | "global" | "industry" | "custom" };
export type Industry = "food" | "retail" | "beauty" | "fashion" | "fitness" | "other";

export const INDUSTRY_LABEL: Record<Industry, string> = {
  food: "מזון ומסעדות",
  retail: "חנות",
  beauty: "יופי וטיפוח",
  fashion: "אופנה",
  fitness: "כושר ובריאות",
  other: "אחר",
};

const hebrew = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", timeZone: "UTC" });
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 864e5;

function hebrewOf(t: number): { day: number; month: string } {
  const parts = hebrew.formatToParts(new Date(t));
  return { day: Number(parts.find((p) => p.type === "day")!.value), month: parts.find((p) => p.type === "month")!.value };
}

type Rule = { month: string | string[]; day: number; title: string; kind?: CalEvent["kind"]; span?: number };

// מועדים בתאריך עברי קבוע. "Adar" בשנה רגילה ו-"Adar II" בשנה מעוברת
const HEBREW_RULES: Rule[] = [
  { month: "Elul", day: 29, title: "ערב ראש השנה" },
  { month: "Tishri", day: 1, title: "ראש השנה" },
  { month: "Tishri", day: 2, title: "ראש השנה" },
  { month: "Tishri", day: 9, title: "ערב יום כיפור" },
  { month: "Tishri", day: 10, title: "יום כיפור" },
  { month: "Tishri", day: 14, title: "ערב סוכות" },
  { month: "Tishri", day: 15, title: "סוכות" },
  { month: "Tishri", day: 22, title: "שמחת תורה" },
  { month: "Heshvan", day: 12, title: "יום הזיכרון ליצחק רבין", kind: "memorial" },
  { month: "Kislev", day: 25, title: "חנוכה", span: 8 },
  { month: "Shevat", day: 15, title: "ט״ו בשבט" },
  { month: "Shevat", day: 30, title: "יום המשפחה" },
  { month: ["Adar", "Adar II"], day: 14, title: "פורים" },
  { month: ["Adar", "Adar II"], day: 15, title: "שושן פורים" },
  { month: "Nisan", day: 14, title: "ערב פסח" },
  { month: "Nisan", day: 15, title: "פסח" },
  { month: "Nisan", day: 21, title: "שביעי של פסח" },
  { month: "Iyar", day: 18, title: "ל״ג בעומר" },
  { month: "Iyar", day: 28, title: "יום ירושלים" },
  { month: "Sivan", day: 5, title: "ערב שבועות" },
  { month: "Sivan", day: 6, title: "שבועות" },
  { month: "Av", day: 15, title: "ט״ו באב" },
];

// ימים בינלאומיים שכדאי להכיר בשיווק (חודש-יום)
const GLOBAL_FIXED: [string, string][] = [
  ["02-14", "ולנטיינז דיי"],
  ["03-08", "יום האישה הבינלאומי"],
  ["04-22", "יום כדור הארץ"],
  ["10-07", "יום הזיכרון ל-7 באוקטובר"],
  ["10-31", "האלווין"],
  ["12-25", "חג המולד"],
  ["12-31", "סילבסטר"],
];

const INDUSTRY_FIXED: Record<Exclude<Industry, "other">, [string, string][]> = {
  retail: [],
  food: [
    ["02-09", "יום הפיצה הבינלאומי"],
    ["05-13", "יום החומוס הבינלאומי"],
    ["05-28", "יום ההמבורגר העולמי"],
    ["06-18", "יום הסושי הבינלאומי"],
    ["07-07", "יום השוקולד העולמי"],
    ["10-01", "יום הקפה הבינלאומי"],
    ["10-16", "יום המזון העולמי"],
    ["10-25", "יום הפסטה העולמי"],
    ["11-01", "יום הטבעונות העולמי"],
  ],
  beauty: [
    ["03-08", "יום האישה – קמפיינים ליופי"],
    ["07-29", "יום השפתון"],
  ],
  // שבועות האופנה משתנים משנה לשנה – התאריכים משוערים, כדאי לאמת מול לוח האירועים הרשמי
  fashion: [
    ["02-12", "שבוע האופנה בניו יורק (משוער)"],
    ["02-20", "שבוע האופנה בלונדון (משוער)"],
    ["02-25", "שבוע האופנה במילאנו (משוער)"],
    ["03-02", "שבוע האופנה בפריז (משוער)"],
    ["09-11", "שבוע האופנה בניו יורק (משוער)"],
    ["09-18", "שבוע האופנה בלונדון (משוער)"],
    ["09-23", "שבוע האופנה במילאנו (משוער)"],
    ["09-29", "שבוע האופנה בפריז (משוער)"],
  ],
  fitness: [
    ["04-07", "יום הבריאות העולמי"],
    ["06-21", "יום היוגה הבינלאומי"],
  ],
};

// זיהוי התחום לפי שם הלקוח והאפיון, אם לא נבחר ידנית
export function guessIndustry(text: string): Industry {
  const t = text.toLowerCase();
  if (/פיצ|מסעד|קפה|אוכל|שף|מאפ|בורגר|סושי|גלידה|בר |ביסטרו|דג|חווה|pizza|food|cafe|restaurant|bakery|fish|farm/.test(t)) return "food";
  if (/חנות|בוטיק|shop|store/.test(t)) return "retail";
  if (/איפור|יופי|קוסמטי|ציפורנ|שיער|גבות|ריסים|טיפוח|makeup|beauty|nails|hair/.test(t)) return "beauty";
  if (/אופנה|בגד|בוטיק|שמל|תכשיט|נעל|fashion|boutique|jewel/.test(t)) return "fashion";
  if (/כושר|פילאטיס|יוגה|אימון|ריצה|תזונ|gym|fitness|pilates|yoga/.test(t)) return "fitness";
  return "other";
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return Date.UTC(year, month, 1 + offset + (n - 1) * 7);
}

// כל האירועים בטווח תאריכים [from, to] כולל
export function calendarEvents(from: string, to: string, industry: Industry): CalEvent[] {
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  const out: CalEvent[] = [];
  const add = (t: number, title: string, kind: CalEvent["kind"]) => {
    if (t >= start && t <= end) out.push({ date: iso(t), title, kind });
  };

  // סורקים חודש קדימה ואחורה כדי לתפוס מועדים שזזים (יום העצמאות, חנוכה)
  for (let t = start - 40 * DAY; t <= end + 10 * DAY; t += DAY) {
    const h = hebrewOf(t);
    const wd = new Date(t).getUTCDay();
    for (const r of HEBREW_RULES) {
      const months = Array.isArray(r.month) ? r.month : [r.month];
      if (months.includes(h.month) && h.day === r.day) {
        if (r.span) for (let i = 0; i < r.span; i++) add(t + i * DAY, `${r.title} · נר ${i + 1}`, "holiday");
        else add(t, r.title, r.kind ?? "holiday");
      }
    }
    // יום השואה: 27 בניסן; שישי ← חמישי, ראשון ← שני
    if (h.month === "Nisan" && h.day === 27) add(t + (wd === 5 ? -1 : wd === 0 ? 1 : 0) * DAY, "יום השואה", "memorial");
    // יום הזיכרון ויום העצמאות: לפי היום שבו חל ה' באייר
    if (h.month === "Iyar" && h.day === 5) {
      const shift = wd === 5 ? -1 : wd === 6 ? -2 : wd === 1 ? 1 : 0;
      add(t + (shift - 1) * DAY, "יום הזיכרון", "memorial");
      add(t + shift * DAY, "יום העצמאות", "holiday");
    }
    // תשעה באב: אם חל בשבת – נדחה לראשון
    if (h.month === "Av" && h.day === 9) add(t + (wd === 6 ? 1 : 0) * DAY, "תשעה באב", "memorial");
  }

  for (let y = new Date(start).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) {
    for (const [md, title] of GLOBAL_FIXED) add(Date.parse(`${y}-${md}T00:00:00Z`), title, title.includes("זיכרון") ? "memorial" : "global");
    const thanksgiving = nthWeekday(y, 10, 4, 4);
    add(thanksgiving + DAY, "בלאק פריידי", "global");
    add(thanksgiving + 4 * DAY, "סייבר מאנדיי", "global");
    if (industry !== "other") {
      for (const [md, title] of INDUSTRY_FIXED[industry]) add(Date.parse(`${y}-${md}T00:00:00Z`), title, "industry");
      if (industry === "food") add(nthWeekday(y, 7, 5, 1), "יום הבירה הבינלאומי", "industry");
      if (industry === "fitness") add(nthWeekday(y, 5, 3, 1), "יום הריצה העולמי", "industry");
    }
  }

  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.date + e.title) ? false : (seen.add(e.date + e.title), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
