import Link from "next/link";
import { Chevron } from "./chevron";
import { memberName, type AppContext } from "@/lib/context";
import { israelToUTC, shortDate, todayIL } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { loadToday } from "@/lib/today";
import { loadWeek } from "@/lib/week";
import { TYPE_LABEL, type Client, type TeamMeeting } from "@/lib/types";
import { Avatar } from "./avatar";
import { IdeaComposer } from "./idea-composer";
import { MessageList } from "./message-list";
import { TeamMeetings } from "./team-meetings";
import { TodoList } from "./todo-list";
import { TrendsCard } from "./trends-card";
import { WeekAgenda } from "./week-agenda";
import { UrgentPanel } from "./urgent-panel";
import { loadUrgent } from "@/lib/urgent";
import { TodayDetail } from "./today-detail";
import { ContentIcon, type IconKind } from "./content-icon";

// דף הבית של הצוות: דאשבורד כללי (כל הלקוחות) או "היום" בפורטל של לקוח אחד
export type PortalTab = "today" | "tasks" | "meetings" | "events" | "data";
export const PORTAL_TABS: { k: PortalTab; l: string; icon: IconKind }[] = [
  { k: "today", l: "היום", icon: "holiday" }, { k: "tasks", l: "משימות", icon: "task" }, { k: "meetings", l: "פגישות", icon: "meeting" },
  { k: "events", l: "אירועים", icon: "event" }, { k: "data", l: "נתונים", icon: "chart" },
];

// בפורטל של לקוח (צוות): טאבים מתחת לקאבר. "היום" הוא ברירת המחדל; בשאר הטאבים מוצג tabContent
export async function Dashboard({ ctx, clients, portal, tab = "today", tabContent }: { ctx: AppContext; clients: Client[]; portal: boolean; tab?: PortalTab; tabContent?: React.ReactNode }) {
  const today = todayIL();
  const supabase = await createClient();
  const startOfDay = israelToUTC(today, "00:00"), endOfDay = israelToUTC(today, "23:59");
  const [data, week, teamMeetings, , meetingsToday, eventsToday, storiesToday, urgent] = await Promise.all([
    loadToday(clients, today),
    loadWeek(clients, today),
    portal ? Promise.resolve({ data: [] }) : supabase.from("team_meetings").select("*").order("starts_at", { ascending: false }).limit(20),
    Promise.resolve({ data: [] }), // (הפניות האחרונות הוסרו מ"היום")
    portal ? supabase.from("meetings").select("id, starts_at, kind, location").eq("client_id", clients[0].id).gte("starts_at", startOfDay).lte("starts_at", endOfDay).order("starts_at") : Promise.resolve({ data: [] }),
    portal ? supabase.from("client_events").select("id, title, description").eq("client_id", clients[0].id).eq("date", today) : Promise.resolve({ data: [] }),
    portal ? supabase.from("one_off_stories").select("id, media").eq("client_id", clients[0].id).eq("date", today) : Promise.resolve({ data: [] }),
    portal && tab === "today" ? loadUrgent(supabase, ctx, clients[0]) : Promise.resolve(null),
  ]);
  // "היום" בפורטל: כל הקבצים במלואם (תמונות וסרטונים מקוריים) – רק לתוכן של היום
  type M = { path: string; thumb: string | null; kind: string };
  const storyMedia = Object.fromEntries(((storiesToday.data ?? []) as { id: string; media: M[] }[]).map((x) => [`o:${x.id}`, x.media ?? []]));
  const fullPaths = portal && tab === "today"
    ? [...(data.perClient[0]?.rows ?? []).flatMap((r) => (r.kind === "item" ? r.item.media.flatMap((m) => [m.path, m.thumb]) : [])), ...Object.values(storyMedia).flat().flatMap((m) => [m.path, m.thumb])]
    : [];
  const fullUrls = fullPaths.length ? await signPaths(fullPaths) : {};
  const isOwner = ctx.role === "owner";
  const names = Object.fromEntries(ctx.clients.map((c) => [c.id, c.name]));
  const brandPaths = clients.flatMap((c) => {
    const b = c.brand as { logo_path?: string; cover_path?: string };
    return [b?.logo_path];
  });
  const todayThumbs = data.perClient.flatMap((p) => p.rows.flatMap((r) => (r.kind === "item"
    ? [...r.item.media.map((m) => m.thumb), r.item.thumb_path, ...(r.item.thumb_path ? [] : r.item.media.filter((m) => m.kind === "video").map((m) => m.path))]
    : [])));
  const signed = await signPaths([...brandPaths, ...todayThumbs]);

  // מנהלת הסטודיו רואה בנפרד את הלקוחות שלה ואת מה שקורה אצל כל מנהל/ת לקוחות
  const mine = isOwner && !portal ? data.perClient.filter((p) => p.client.manager_id === ctx.userId) : data.perClient;
  const others = isOwner && !portal ? data.perClient.filter((p) => p.client.manager_id !== ctx.userId) : [];
  const total = mine.reduce((n, p) => n + p.rows.length, 0);
  const done = mine.reduce((n, p) => n + p.rows.filter((r) => r.done).length, 0);
  const managers = ctx.team.filter((t) => t.role === "manager");
  const firstName = ctx.profile.full_name.split(" ")[0];

  const client = clients[0];

  return (
    <>
      {portal ? (
        <div className="phead">
          <h1 className="display-title">{client.name}</h1>
          <div className="txt">
            מנהל/ת לקוח: {memberName(ctx, client.manager_id)}
            {isOwner && <> · <Link className="edit" href={`/c/${client.id}/file?tab=settings`}>שינוי</Link></>}
          </div>
        </div>
      ) : (
        <div className="hello">
          <span className="txt big">שלום, {firstName || "ברוכים הבאים"}</span>
          <h1 className="display-title">השבוע שלך</h1>
          <span className="rolebadge">
            {isOwner ? `מנהלת הסטודיו · מנהלת בעצמך ${count(ctx.clients.filter((c) => c.manager_id === ctx.userId).length)} · בצוות: ${managers.map((m) => m.full_name).join(", ") || "אין עדיין"}` : `מנהל/ת לקוחות · ${count(clients.length)}`}
          </span>
        </div>
      )}

      {portal && (
        <nav className="ptabs" aria-label="נושאים">
          {PORTAL_TABS.map((t) => (
            <Link key={t.k} href={t.k === "today" ? `/c/${client.id}` : `/c/${client.id}?tab=${t.k}`} className="ptab" aria-current={tab === t.k ? "page" : undefined} scroll={false}>
              <ContentIcon kind={t.icon} size={20} /><span>{t.l}</span>
            </Link>
          ))}
        </nav>
      )}
      {portal ? (tab !== "today" ? tabContent : (<>
        {urgent && <UrgentPanel clientId={client.id} {...urgent} />}
        <TodayDetail clientId={client.id} studioId={client.studio_id} rows={data.perClient[0]?.rows ?? []} urls={fullUrls} storyMedia={storyMedia}
          meetings={(meetingsToday.data ?? []) as { id: string; starts_at: string; kind: string; location: string }[]}
          events={(eventsToday.data ?? []) as { id: string; title: string }[]} />
      </>)) : (<>

      <WeekAgenda days={week} today={today} />

      {!portal && clients.length === 0 && isOwner && (
        <p className="empty sec">עוד אין לקוחות. <Link className="edit" href="/clients/new">הוספת לקוח ראשון</Link></p>
      )}

      {!portal && <section className="sec">
        <div className="sechead">
          <div className="label dotted">{isOwner ? "הלקוחות שלי · להעלות היום" : "להעלות היום"}</div>
          <span className="txt num">{done}/{total}</span>
        </div>
        {mine.filter((p) => p.rows.length).map((p) => (
          <TodoList key={p.client.id} clientId={p.client.id} clientName={p.client.name} color={p.client.color} rows={p.rows} linkToPortal={!portal} thumbs={signed} />
        ))}
        {total === 0 && <p className="empty">אין העלאות היום</p>}
      </section>}

      {others.some((p) => p.rows.length) && (
        <section className="sec">
          <div className="label dotted">אצל הצוות · להעלות היום</div>
          {managers.map((m) => {
            const theirs = others.filter((p) => p.client.manager_id === m.id && p.rows.length);
            if (!theirs.length) return null;
            const t = theirs.reduce((n, p) => n + p.rows.length, 0);
            const d = theirs.reduce((n, p) => n + p.rows.filter((r) => r.done).length, 0);
            return (
              <div key={m.id} className="stack">
                <div className="who"><Avatar src={m.avatar} name={m.full_name} size={30} /><b className="w500">{m.full_name}</b><span className="txt num">{d}/{t} סומנו</span></div>
                {theirs.map((p) => (
                  <TodoList key={p.client.id} clientId={p.client.id} clientName={p.client.name} color={p.client.color} rows={p.rows} linkToPortal thumbs={signed} />
                ))}
              </div>
            );
          })}
        </section>
      )}

      {!portal && <TeamMeetings meetings={(teamMeetings.data ?? []) as TeamMeeting[]} team={ctx.team} isOwner={isOwner} today={today} />}

      {!portal && <MessageList messages={data.messages} clientNames={names} />}

      {isOwner && (data.review.length > 0 || data.overdue.length > 0) && (
        <section className="sec">
          <div className="label dotted">דורש אותך</div>
          <div className="note">
            {[...data.review, ...data.overdue].map((i) => (
              <Link key={i.id} href={`/c/${i.client_id}/gantt?m=${i.date.slice(0, 7)}`} className="todo">
                <span className="sdot" style={{ ["--c" as string]: `var(--s-${i.status === "review" ? "review" : "work"})` }} />
                <span className="tx col">
                  <span className="t">{i.title}</span>
                  <span className="txt">{i.status === "review" ? "לבדיקה שלך" : `לא סומן שעלה · ${shortDate(i.date)}`} · {TYPE_LABEL[i.type]} · {names[i.client_id]}</span>
                </span>
                <span className="arrow"><Chevron dir="forward" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!portal && <TrendsCard isOwner={isOwner} />}


      <IdeaComposer clients={clients.map((c) => ({ id: c.id, name: c.name }))} today={today} isClient={false} />
      </>)}
    </>
  );
}

function count(n: number) {
  return n === 1 ? "לקוח אחד" : `${n} לקוחות`;
}
