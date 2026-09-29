import Link from "next/link";
import { MONTHS } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { fmt } from "@/lib/report-calc";

// כרטיס קטן בדף הבית של הלקוח – מוביל לדוח החודשי של החודש שהסתיים
export async function ReportChip({ clientId, today, isStaff }: { clientId: string; today: string; isStaff: boolean }) {
  // כמו בדף הדוח: עד ה-5 בחודש – החודש שהסתיים, אחר כך – החודש הנוכחי
  const [y, m, d] = today.split("-").map(Number);
  const month = d <= 5 ? new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10) : `${today.slice(0, 7)}-01`;
  const supabase = await createClient();
  const [{ data: metrics }, { data: report }] = await Promise.all([
    supabase.from("metrics").select("followers, reach").eq("client_id", clientId).eq("month", month),
    supabase.from("monthly_reports").select("published_at").eq("client_id", clientId).eq("month", month).maybeSingle(),
  ]);
  const published = !!report?.published_at;
  if (!isStaff && !published) return null; // ללקוח – רק כשהדוח מוכן
  const followers = (metrics ?? []).reduce((n, r) => n + (r.followers ?? 0), 0);
  const reach = (metrics ?? []).reduce((n, r) => n + (r.reach ?? 0), 0);
  const name = MONTHS[Number(month.slice(5, 7)) - 1];
  const sub = [followers && `${fmt(followers)} עוקבים`, reach && `${fmt(reach)} חשיפה`].filter(Boolean).join(" · ");
  return (
    <Link href={`/c/${clientId}/report?m=${month.slice(0, 7)}`} className="report-chip">
      <span className="rc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg>
      </span>
      <span className="rc-body">
        <b className="w500">הדוח החודשי · {name}</b>
        <span className="txt num">{sub || (isStaff ? "עוד אין נתונים · להזנה" : "מוכן לצפייה")}</span>
      </span>
      {isStaff && <span className={`pill${published ? " ok" : ""}`}>{published ? "פורסם" : "טיוטה"}</span>}
    </Link>
  );
}
