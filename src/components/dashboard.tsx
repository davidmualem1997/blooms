import Link from "next/link";
import { Chevron } from "./chevron";
import { CoverEdit, LogoEdit } from "./hero-brand-edit";
import { memberName, type AppContext } from "@/lib/context";
import { longToday, shortDate, todayIL } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/server";
import { loadToday } from "@/lib/today";
import { loadWeek } from "@/lib/week";
import { MESSAGE_LABEL, REQUEST_STATUS, TYPE_LABEL, type Client, type Message, type TeamMeeting } from "@/lib/types";
import { Avatar } from "./avatar";
import { IdeaComposer } from "./idea-composer";
import { MessageList } from "./message-list";
import { TeamMeetings } from "./team-meetings";
import { TodoList } from "./todo-list";
import { TrendsCard } from "./trends-card";
import { WeekAgenda } from "./week-agenda";
import { PortalTop } from "./portal-top";

// דף הבית של הצוות: דאשבורד כללי (כל הלקוחות) או "היום" בפורטל של לקוח אחד
export async function Dashboard({ ctx, clients, portal }: { ctx: AppContext; clients: Client[]; portal: boolean }) {
  const today = todayIL();
  const supabase = await createClient();
  const [data, week, teamMeetings, recentRes] = await Promise.all([
    loadToday(clients, today),
    loadWeek(clients, today),
    portal ? Promise.resolve({ data: [] }) : supabase.from("team_meetings").select("*").order("starts_at", { ascending: false }).limit(20),
    // בפורטל: שלוש הפניות האחרונות של הלקוח, כמו בדף של הלקוח
    portal ? supabase.from("messages").select("*").eq("client_id", clients[0].id).order("updated_at", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
  ]);
  const recent = (recentRes.data ?? []) as Message[];
  const isOwner = ctx.role === "owner";
  const names = Object.fromEntries(ctx.clients.map((c) => [c.id, c.name]));
  const brandPaths = clients.flatMap((c) => {
    const b = c.brand as { logo_path?: string; cover_path?: string };
    return [b?.logo_path, portal ? b?.cover_path : undefined];
  });
  const todayThumbs = data.perClient.flatMap((p) => p.rows.flatMap((r) => (r.kind === "item" ? r.item.media.map((m) => m.thumb) : [])));
  const signed = await signPaths([...brandPaths, ...todayThumbs]);

  // מנהלת הסטודיו רואה בנפרד את הלקוחות שלה ואת מה שקורה אצל כל מנהל/ת לקוחות
  const mine = isOwner && !portal ? data.perClient.filter((p) => p.client.manager_id === ctx.userId) : data.perClient;
  const others = isOwner && !portal ? data.perClient.filter((p) => p.client.manager_id !== ctx.userId) : [];
  const total = mine.reduce((n, p) => n + p.rows.length, 0);
  const done = mine.reduce((n, p) => n + p.rows.filter((r) => r.done).length, 0);
  const managers = ctx.team.filter((t) => t.role === "manager");
  const firstName = ctx.profile.full_name.split(" ")[0];

  const client = clients[0];
  const brand = (client?.brand ?? {}) as { logo_path?: string; cover_path?: string };

  return (
    <>
      {portal ? (
        <div className="phero">
          <div className="cover" style={brand.cover_path && signed[brand.cover_path] ? { backgroundImage: `url(${signed[brand.cover_path]})` } : undefined}>
            <CoverEdit clientId={client.id} studioId={client.studio_id} />
          </div>
          <div className="phero-row">
            <span className="logo-wrap">
              <Avatar src={brand.logo_path ? signed[brand.logo_path] : null} name={client.name} size={76} color={client.color} />
              <LogoEdit clientId={client.id} studioId={client.studio_id} />
            </span>
            <div>
              <h1 className="display-title">{client.name}</h1>
              <div className="txt">
                {longToday(today)} · מנהל/ת לקוח: {memberName(ctx, client.manager_id)}
                {isOwner && <> · <Link className="edit" href={`/c/${client.id}/file?tab=settings`}>שינוי</Link></>}
              </div>
            </div>
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

      {portal && <PortalTop clientId={client.id} today={today} canEdit />}

      <WeekAgenda days={week} today={today} />

      {!portal && clients.length === 0 && isOwner && (
        <p className="empty sec">עוד אין לקוחות. <Link className="edit" href="/clients/new">הוספת לקוח ראשון</Link></p>
      )}

      <section className="sec">
        <div className="sechead">
          <div className="label dotted">{isOwner && !portal ? "הלקוחות שלי · להעלות היום" : "להעלות היום"}</div>
          <span className="txt num">{done}/{total}</span>
        </div>
        {mine.filter((p) => p.rows.length).map((p) => (
          <TodoList key={p.client.id} clientId={p.client.id} clientName={p.client.name} color={p.client.color} rows={p.rows} linkToPortal={!portal} thumbs={signed} />
        ))}
        {total === 0 && <p className="empty">אין העלאות היום</p>}
      </section>

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

      {portal && recent.length > 0 && (
        <section className="sec">
          <div className="sechead"><div className="label dotted">פניות אחרונות</div><Link className="edit more" href={`/c/${client.id}/requests`}>לכל הפניות <Chevron dir="forward" size={13} /></Link></div>
          <div className="note">
            {recent.map((m) => (
              <Link key={m.id} href={`/c/${client.id}/requests?f=${m.status === "done" ? "done" : m.status === "to_meeting" ? "meeting" : "open"}`} className="soon">
                <span><span className={`tag kind-${m.kind}`}>{MESSAGE_LABEL[m.kind]}</span> “{m.body.length > 34 ? m.body.slice(0, 34) + "…" : m.body}”</span>
                <span className={`rstatus ${m.status}`}>{REQUEST_STATUS[m.status]}{m.status === "done" ? " ✓" : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <IdeaComposer clients={clients.map((c) => ({ id: c.id, name: c.name }))} today={today} isClient={false} />
    </>
  );
}

function count(n: number) {
  return n === 1 ? "לקוח אחד" : `${n} לקוחות`;
}
