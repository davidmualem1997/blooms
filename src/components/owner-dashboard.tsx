import Link from "next/link";
import type { AppContext } from "@/lib/context";
import { MONTHS, israelToUTC, parseISODate, shortDate, toISODate, todayIL } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { loadToday } from "@/lib/today";
import { currentWeekStart, type Trend } from "@/lib/trends";
import { loadWeek } from "@/lib/week";
import { TYPE_LABEL, type ContentItem, type TeamMeeting } from "@/lib/types";
import { Chevron } from "./chevron";
import { RefreshTrends } from "./refresh-trends";
import { ScheduleTeamMeeting, TeamMeetings } from "./team-meetings";
import { TodayBoard, type BoardRow } from "./today-board";
import { WeekAgenda } from "./week-agenda";

type Attention = { key: string; client: string; text: string; href: string; weight: number };

// דאשבורד מנהלת הסטודיו: תמונת מצב תפעולית של כל הסטודיו. מה שאין – לא תופס מקום
export async function OwnerDashboard({ ctx }: { ctx: AppContext }) {
  const today = todayIL();
  const clients = ctx.clients;
  const ids = clients.map((c) => c.id);
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const soon = (() => { const d = parseISODate(today); d.setUTCDate(d.getUTCDate() + 2); return toISODate(d); })();
  const weekAgo = toISODate(new Date(parseISODate(today).getTime() - 7 * 864e5));
  const supabase = await createClient();

  const [data, week, meetingsRes, pendingRes, upcomingRes, ideasRes, trendsRes] = await Promise.all([
    loadToday(clients, today),
    loadWeek(clients, today),
    supabase.from("team_meetings").select("*").gte("starts_at", israelToUTC(today, "00:00")).order("starts_at").limit(5),
    ids.length ? supabase.from("content_items").select("id, client_id").in("client_id", ids).eq("status", "client") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("content_items").select("*").in("client_id", ids).gte("date", today).lte("date", soon).neq("status", "live") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("ideas").select("id, client_id").in("client_id", ids).gte("created_at", weekAgo) : Promise.resolve({ data: [] }),
    supabase.from("weekly_trends").select("week_start, items").order("week_start", { ascending: false }).limit(1),
  ]);

  // ---- עולה היום: אצלי | אצל הצוות
  const ownerOf = (managerId: string | null) => {
    const m = ctx.team.find((t) => t.id === managerId);
    return { name: m?.full_name || "לא שויך", avatar: m?.avatar ?? null };
  };
  const board: BoardRow[] = data.perClient.flatMap((p) => p.rows.map((row) => ({ clientId: p.client.id, clientName: p.client.name, owner: ownerOf(p.client.manager_id), row })));
  const mine = board.filter((b) => clients.find((c) => c.id === b.clientId)?.manager_id === ctx.userId);
  const team = board.filter((b) => !mine.includes(b));
  const thumbs = await signPaths(board.flatMap((b) => (b.row.kind === "item" ? b.row.item.media.map((m) => m.thumb) : [])));

  // ---- דורש טיפול
  const attention: Attention[] = [];
  const pending = (pendingRes.data ?? []) as { id: string; client_id: string }[];
  for (const id of new Set(pending.map((p) => p.client_id))) {
    const n = pending.filter((p) => p.client_id === id).length;
    attention.push({ key: `a${id}`, client: name[id], text: `${n === 1 ? "תוכן אחד מחכה" : `${n} תכנים מחכים`} לאישור הלקוח`, href: `/c/${id}`, weight: 2 });
  }
  for (const i of data.review) attention.push({ key: `r${i.id}`, client: name[i.client_id], text: `"${i.title}" מחכה לבדיקה שלך`, href: `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`, weight: 1 });
  for (const i of data.overdue) {
    const d = parseISODate(i.date);
    const yesterday = toISODate(new Date(parseISODate(today).getTime() - 864e5)) === i.date;
    attention.push({ key: `o${i.id}`, client: name[i.client_id], text: `${TYPE_LABEL[i.type]} ${yesterday ? "של אתמול" : `מ־${d.getUTCDate()}.${d.getUTCMonth() + 1}`} לא סומן שעלה`, href: `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`, weight: 0 });
  }
  for (const i of (upcomingRes.data ?? []) as ContentItem[]) {
    if (i.media.length) continue;
    const when = i.date === today ? "היום" : i.date === soon ? `ב־${shortDate(i.date)}` : "מחר";
    attention.push({ key: `m${i.id}`, client: name[i.client_id], text: `חסר קובץ ל${TYPE_LABEL[i.type]} של ${when}`, href: `/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`, weight: 0 });
  }
  attention.sort((a, b) => a.weight - b.weight);

  // ---- KPI
  const upToday = board.length;
  const meetingsThisWeek = week.reduce((n, d) => n + d.entries.filter((e) => e.kind === "meeting" || e.kind === "team").length, 0);

  // ---- פניות
  const req = { new: 0, in_progress: 0, to_meeting: 0 };
  for (const m of data.messages) if (m.status in req) req[m.status as keyof typeof req]++;
  const reqTotal = req.new + req.in_progress + req.to_meeting;

  // ---- רעיונות וטרנדים
  const trendsRow = trendsRes.data?.[0] as { week_start: string; items: Trend[] } | undefined;
  const freshTrends = trendsRow && trendsRow.week_start === currentWeekStart() ? trendsRow.items : [];
  const ideas = (ideasRes.data ?? []) as { id: string; client_id: string }[];
  const ideasByClient = [...new Set(ideas.map((i) => i.client_id))].map((id) => ({ id, n: ideas.filter((i) => i.client_id === id).length }));

  const first = parseISODate(week[0].date), last = parseISODate(week[6].date);
  const range = `${first.getUTCDate()}–${last.getUTCDate()} ב${MONTHS[last.getUTCMonth()]}`;
  const upcomingTeam = (meetingsRes.data ?? []) as TeamMeeting[];

  return (
    <>
      <div className="ohead">
        <span className="txt big">שלום, {ctx.profile.full_name.split(" ")[0] || "יולי"}</span>
        <h1 className="display-title">השבוע ב־BLOOMS</h1>
        <span className="txt num">{range}</span>
      </div>

      <div className="kpis">
        <div className="kpi"><b className="num">{upToday}</b><span>עולים היום</span></div>
        <div className="kpi"><b className="num">{pending.length}</b><span>מחכים לאישור</span></div>
        <div className={`kpi${attention.length ? " hot" : ""}`}><b className="num">{attention.length}</b><span>דורשים טיפול</span></div>
        <div className="kpi"><b className="num">{meetingsThisWeek}</b><span>פגישות השבוע</span></div>
      </div>

      {attention.length > 0 && (
        <section className="sec">
          <div className="label dotted">דורש טיפול</div>
          <div className="note">
            {attention.slice(0, 5).map((a) => (
              <Link key={a.key} href={a.href} className="attn">
                <span className="tx col"><b className="w500">{a.client}</b><span className="txt">{a.text}</span></span>
                <span className="open">לפתיחה <Chevron dir="forward" size={13} /></span>
              </Link>
            ))}
          </div>
          {attention.length > 5 && <span className="txt">ועוד {attention.length - 5}</span>}
        </section>
      )}

      {board.length > 0 && <TodayBoard mine={mine} team={team} thumbs={thumbs} />}

      <section className="sec">
        <div className="sechead"><div className="label dotted">השבוע</div><ScheduleTeamMeeting team={ctx.team} today={today} /></div>
        <WeekAgenda days={week} today={today} compact />
      </section>

      {reqTotal > 0 && (
        <section className="sec">
          <div className="sechead"><div className="label dotted">פניות מלקוחות</div><Link className="edit more" href="/requests">לכל הפניות <Chevron dir="forward" size={13} /></Link></div>
          <div className="reqsum">
            {req.new > 0 && <Link href="/requests?f=open" className="rs new"><b className="num">{req.new}</b> חדשות</Link>}
            {req.in_progress > 0 && <Link href="/requests?f=open" className="rs in_progress"><b className="num">{req.in_progress}</b> בטיפול</Link>}
            {req.to_meeting > 0 && <Link href="/requests?f=meeting" className="rs to_meeting"><b className="num">{req.to_meeting}</b> לשיחה הבאה</Link>}
          </div>
        </section>
      )}

      <TeamMeetings meetings={upcomingTeam} team={ctx.team} isOwner today={today} compact />

      {(freshTrends.length > 0 || ideas.length > 0) && (
        <section className="sec">
          <div className="sechead"><div className="label dotted">רעיונות וטרנדים</div><RefreshTrends /></div>
          <div className="reqsum">
            {freshTrends.length > 0 && <span className="rs lilac"><b className="num">{freshTrends.length}</b> טרנדים חדשים</span>}
            {ideasByClient.map((x) => <Link key={x.id} href={`/c/${x.id}/inspiration`} className="rs">{name[x.id]} · <b className="num">{x.n}</b> רעיונות חדשים</Link>)}
          </div>
          {freshTrends.length > 0 && (
            <details className="acc">
              <summary>הטרנדים של השבוע</summary>
              <div className="accb">
                {freshTrends.map((t, i) => (
                  <div key={i} className="mpast">
                    <b className="w500">{t.title}</b><span className="txt">{t.platform}</span>
                    <p className="pre">{t.what}</p><p className="pre sub"><b className="w500">איך להשתמש:</b> {t.how}</p>
                    {t.source && <a className="edit" href={t.source} target="_blank" rel="noopener">מקור</a>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      {!freshTrends.length && !ideas.length && <div className="sec"><RefreshTrends /></div>}
    </>
  );
}
