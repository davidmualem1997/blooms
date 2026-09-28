import { createClient } from "@/lib/supabase/server";
import { loadReport } from "@/lib/report";
import { DataReport } from "./data-report";
import { MonthList, type FocusItem } from "./month-list";

// החלק העליון בדף הבית של לקוח (ללקוח ולצוות): דוח נתונים ורעיונות שיווקיים לחודש
export async function PortalTop({ clientId, today, canEdit }: { clientId: string; today: string; canEdit: boolean }) {
  const month = today.slice(0, 7) + "-01";
  const supabase = await createClient();
  const [report, { data: marketing }] = await Promise.all([
    loadReport(clientId, today),
    supabase.from("monthly_focus").select("id, text, done, url").eq("client_id", clientId).eq("month", month).eq("kind", "marketing").order("position"),
  ]);
  return (
    <>
      <div className="sec"><DataReport clientId={clientId} today={today} canEdit={canEdit} {...report} /></div>
      <MonthList clientId={clientId} month={month} kind="marketing" items={(marketing ?? []) as FocusItem[]} canEdit={canEdit}
        title="רעיונות ודגשים שיווקיים לחודש" placeholder="למשל: שיתוף פעולה עם משפיענים, מבצע הפי האוור" />
    </>
  );
}
