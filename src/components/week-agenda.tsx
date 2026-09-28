import Link from "next/link";
import { MONTHS } from "@/lib/dates";
import type { AgendaDay, AgendaEntry } from "@/lib/week";

const WD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const KIND_LABEL: Record<AgendaEntry["kind"], string> = {
  post: "פוסט", reel: "ריל", tiktok: "טיקטוק", meeting: "פגישה", team: "צוות", event: "★", holiday: "", memorial: "", deadline: "דדליין",
};

// "השבוע שלך": לוח שבועי בקוביות, כמו לוח השנה בפורטל – כל מה שקורה בכל יום מוצג תמיד
export function WeekAgenda({ days, today, compact = false }: { days: AgendaDay[]; today: string; compact?: boolean }) {
  const first = days[0].date;
  const last = days[6].date;
  const range = `${Number(first.slice(8))}–${Number(last.slice(8))} ב${MONTHS[Number(last.slice(5, 7)) - 1]}`;

  return (
    <section className="week">
      {!compact && <div className="txt">{range}</div>}
      <div className={`cal wcal${compact ? " compact" : ""}`}>
        {days.map((d, i) => (
          <div key={d.date} className={`cell${d.date === today ? " today" : ""}${d.date < today ? " past" : ""}`}>
            <span className="wd-in">{WD[i].slice(0, 3)}</span>
            <span className="d num">{Number(d.date.slice(8))}</span>
            {d.entries.map((e, k) => {
              const text = (
                <>
                  {e.time && <b className="num">{e.time} </b>}
                  {KIND_LABEL[e.kind] && e.kind !== "event" && <b>{KIND_LABEL[e.kind]} · </b>}
                  {e.kind === "event" && "★ "}
                  {e.title}
                  {e.sub && e.kind !== "meeting" && <span className="wsub"> · {e.sub}</span>}
                </>
              );
              const cls = `went ${e.kind}${e.done ? " done" : ""}`;
              return e.href ? <Link key={k} href={e.href} className={cls}>{text}</Link> : <span key={k} className={cls}>{text}</span>;
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
