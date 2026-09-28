// כל חישובי "היום" לפי שעון ישראל, גם כשהשרת רץ ב-UTC
const TZ = "Asia/Jerusalem";

export const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function todayIL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekday(s: string): number {
  return parseISODate(s).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 864e5);
}

export function shortDate(s: string): string {
  const d = parseISODate(s);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

export function longToday(s: string): string {
  const d = parseISODate(s);
  return `יום ${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]}`;
}

// מועדי הגשה: תוכנית לבדיקה עד ה-20, אישור סופי עד סוף החודש (לחודש הבא)
export function deadlines(today: string) {
  const t = parseISODate(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  let d20 = new Date(Date.UTC(y, m, 20));
  if (d20 < t) d20 = new Date(Date.UTC(y, m + 1, 20));
  const dEnd = new Date(Date.UTC(y, m + 1, 0));
  const plan20 = new Date(Date.UTC(d20.getUTCFullYear(), d20.getUTCMonth() + 1, 1));
  const planEnd = new Date(Date.UTC(y, m + 1, 1));
  return {
    submit: { date: toISODate(d20), days: daysBetween(today, toISODate(d20)), month: toISODate(plan20) },
    approve: { date: toISODate(dEnd), days: daysBetween(today, toISODate(dEnd)), month: toISODate(planEnd) },
  };
}

export function monthName(firstOfMonth: string): string {
  return MONTHS[parseISODate(firstOfMonth).getUTCMonth()];
}

export function monthRange(firstOfMonth: string): [string, string] {
  const d = parseISODate(firstOfMonth);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return [firstOfMonth, toISODate(end)];
}

// תאריך ושעה בשעון ישראל → ISO ב-UTC (מתחשב בשעון קיץ)
export function israelToUTC(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "10:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess))
    .reduce<Record<string, number>>((a, p) => (p.type !== "literal" ? { ...a, [p.type]: Number(p.value) } : a), {});
  const asIL = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asIL - guess)).toISOString();
}

export function formatIL(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return { date, time };
}
