import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, type Trend } from "@/lib/trends";
import { RefreshTrends } from "./refresh-trends";

// שלושה טרנדים חזקים בסושיאל השבוע – מתחלפים כל יום ראשון
export async function TrendsCard({ isOwner }: { isOwner: boolean }) {
  const supabase = await createClient();
  const week = currentWeekStart();
  const { data } = await supabase.from("weekly_trends").select("week_start, items").order("week_start", { ascending: false }).limit(1);
  const row = data?.[0] as { week_start: string; items: Trend[] } | undefined;
  const stale = row && row.week_start !== week;

  return (
    <section className="sec">
      <div className="sechead">
        <div className="label dotted">טרנדים השבוע</div>
        {isOwner && <RefreshTrends />}
      </div>
      {row ? (
        <div className="trends">
          {row.items.map((t, i) => (
            <div key={i} className={`trend t${i}`}>
              <span className="tnum num">0{i + 1}</span>
              <b className="ttitle">{t.title}</b>
              <span className="tplat">{t.platform}</span>
              <p>{t.what}</p>
              <p className="thow"><b>איך להשתמש:</b> {t.how}</p>
              {t.source && <a className="edit" href={t.source} target="_blank" rel="noopener">מקור</a>}
            </div>
          ))}
        </div>
      ) : <p className="empty">הטרנדים יתעדכנו ביום ראשון בבוקר.</p>}
      {stale && <span className="txt">אלה הטרנדים משבוע שעבר. העדכון הבא ביום ראשון.</span>}
    </section>
  );
}
