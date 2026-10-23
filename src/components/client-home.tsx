import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MONTHS, WEEKDAYS, deadlines, formatIL, israelToUTC, parseISODate, shortDate, toISODate, todayIL, weekday } from "@/lib/dates";
import { signPaths } from "@/lib/media-server";
import { REQUEST_STATUS, type Client, type ClientEvent, type ContentItem, type Meeting, type Message, type OneOffStory, type RecurringStory } from "@/lib/types";
import { Avatar } from "./avatar";
import { Chevron } from "./chevron";
import { NeedsYou, TodayCard } from "./client-home-parts";
import { LogoEdit } from "./hero-brand-edit";
import { UrgentPanel } from "./urgent-panel";
import { loadUrgent } from "@/lib/urgent";
import { getContext } from "@/lib/context";
import { ReportChip } from "./data-report";

const TYPE_SHORT = { post: "Post", reel: "Reel", tiktok: "TikTok" } as const;
const WD = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// דף הבית של הלקוח: קודם מה שצריך ממנו, אחר כך מה עולה ומה קורה השבוע
export async function ClientHome({ client, userName }: { client: Client; userName: string; userId?: string }) {
  const today = todayIL();
  const dl = deadlines(today);
  const days = Array.from({ length: 5 }, (_, i) => { const d = parseISODate(today); d.setUTCDate(d.getUTCDate() + i); return toISODate(d); });
  const supabase = await createClient();
  const [items, pending, recurring, oneOff, meetings, events, mine, summaries, marketing] = await Promise.all([
    supabase.from("content_items").select("*").eq("client_id", client.id).gte("date", days[0]).lte("date", days[4]).order("date"),
    supabase.from("content_items").select("*").eq("client_id", client.id).eq("status", "client").order("date"),
    supabase.from("recurring_stories").select("*").eq("client_id", client.id),
    supabase.from("one_off_stories").select("*").eq("client_id", client.id).gte("date", days[0]).lte("date", days[4]),
    supabase.from("meetings").select("*").eq("client_id", client.id).gte("starts_at", israelToUTC(today, "00:00")).order("starts_at").limit(3),
    supabase.from("client_events").select("*").eq("client_id", client.id).gte("date", today).order("date").limit(3),
    supabase.from("messages").select("*").eq("client_id", client.id).order("updated_at", { ascending: false }).limit(5),
    supabase.from("meetings").select("starts_at, summary").eq("client_id", client.id).neq("summary", "").order("starts_at", { ascending: false }).limit(1),
    supabase.from("monthly_focus").select("id, text, done, url").eq("client_id", client.id).eq("month", today.slice(0, 7) + "-01").eq("kind", "marketing").order("position"),
  ]);
  const urgent = await loadUrgent(supabase, await getContext(), client);
  const marketingItems = (marketing.data ?? []) as { id: string; text: string; done: boolean; url: string }[];
  const weekItems = (items.data ?? []) as ContentItem[];
  const waiting = (pending.data ?? []) as ContentItem[];
  const todays = weekItems.filter((i) => i.date === today);
  const brand = (client.brand ?? {}) as { logo_path?: string; cover_path?: string };
  const signed = await signPaths([...[...weekItems, ...waiting].map((i) => i.thumb_path), brand.logo_path, brand.cover_path]);
  const d0 = parseISODate(today);

  // "השבוע": מה עולה בכל אחד מחמשת הימים הקרובים, כולל סטוריז
  const week = days.map((d) => {
    const wd = weekday(d);
    const labels = [
      ...weekItems.filter((i) => i.date === d).map((i) => TYPE_SHORT[i.type]),
      ...((recurring.data ?? []) as RecurringStory[]).filter((s) => s.weekdays.includes(wd)).map(() => "Story"),
      ...((oneOff.data ?? []) as OneOffStory[]).filter((s) => s.date === d).map(() => "Story"),
    ];
    return { d, labels: [...new Set(labels)] };
  });

  // "בקרוב": פגישות ואירועים באזור אחד
  const soon = [
    ...((meetings.data ?? []) as Meeting[]).filter((m) => !m.summary).map((m) => {
      const { date, time } = formatIL(m.starts_at);
      return { key: m.id, date, title: m.location ? `פגישה · ${m.location}` : "פגישה עם הצוות", when: `${shortDate(date)} · ${time}` };
    }),
    ...((events.data ?? []) as ClientEvent[]).map((e) => ({ key: e.id, date: e.date, title: `אירוע: ${e.title}`, when: shortDate(e.date) })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

  // "עדכונים אחרונים": עד שלושה דברים שהצוות עשה
  const msgs = (mine.data ?? []) as Message[];
  const updates = [
    ...(waiting.length ? [{ at: waiting.map((w) => (w as ContentItem & { updated_at?: string }).updated_at ?? "").sort().at(-1) ?? "", text: `${waiting.length === 1 ? "פריט אחד הועלה" : `${waiting.length} פריטים הועלו`} לאישור שלך` }] : []),
    ...msgs.filter((m) => m.resolved_at).map((m) => ({ at: m.resolved_at!, text: `הפנייה שלך טופלה: ${m.body.length > 40 ? m.body.slice(0, 40) + "…" : m.body}` })),
    ...((summaries.data ?? []) as { starts_at: string }[]).map((m) => ({ at: m.starts_at, text: `סיכום הפגישה מ־${shortDate(formatIL(m.starts_at).date)} זמין בתיק הלקוח`, href: `/c/${client.id}/file` })),
    ...((events.data ?? []) as ClientEvent[]).filter((e) => (e.images ?? []).length).map((e) => ({ at: e.date, text: `נוספו תמונות לאירוע ${e.title}`, href: `/c/${client.id}/file` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3) as { at: string; text: string; href?: string }[];

  return (
    <>
      <header className="chead">
        <div className="cover slim" style={brand.cover_path && signed[brand.cover_path] ? { backgroundImage: `url(${signed[brand.cover_path]})` } : undefined} />
        <div className="chead-row">
          <span className="logo-wrap">
            <Avatar src={brand.logo_path ? signed[brand.logo_path] : null} name={client.name} size={44} color={client.color} />
            <LogoEdit clientId={client.id} studioId={client.studio_id} />
          </span>
          <span className="chead-name"><b>{client.name}</b><small>הפורטל שלכם</small></span>
        </div>
        <div className="txt big">שלום{userName ? ` ${userName.split(" ")[0]}` : ""}, יום {WEEKDAYS[d0.getUTCDay()]} {d0.getUTCDate()} ב{MONTHS[d0.getUTCMonth()]}</div>
      </header>

      {/* הודעות דחופות מהצוות */}
      {urgent.threads.length > 0 && <UrgentPanel clientId={client.id} threads={urgent.threads} recipients={[]} />}

      {waiting.length > 0 && (
        <NeedsYou clientId={client.id} items={waiting} thumbs={signed} deadline={shortDate(dl.approve.date)} />
      )}

      <section className="sec">
        <div className="label dotted">עולה היום</div>
        {todays.length
          ? todays.map((i) => <TodayCard key={i.id} item={i} thumb={i.thumb_path ? signed[i.thumb_path] : undefined} />)
          : <p className="txt">אין תוכן שמתוכנן להיום</p>}
      </section>

      {/* הדוח החודשי – מופיע רק כשהצוות פרסם אותו */}
      <ReportChip clientId={client.id} today={today} isStaff={false} />

      {marketingItems.length > 0 && (
        <section className="sec">
          <div className="label dotted">דגשים שיווקיים לחודש</div>
          <div className="note">
            {marketingItems.map((f) => (
              <div key={f.id} className={`task${f.done ? " done" : ""}`}>
                <span className="box" aria-pressed={f.done} aria-hidden="true">✓</span>
                <span className="tt">{f.text}{f.url && <> · <a className="edit" href={/^https?:/.test(f.url) ? f.url : `https://${f.url}`} target="_blank" rel="noopener">השראה</a></>}</span>
                <span />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <div className="label dotted">השבוע</div>
        <div className="wk">
          {week.map((w, i) => (
            <div key={w.d} className={`wkday${i === 0 ? " now" : ""}`}>
              <span className="wkd">{i === 0 ? "היום" : WD[weekday(w.d)]}</span>
              {w.labels.length ? w.labels.map((l) => <span key={l} className={`wkl ${l.toLowerCase()}`}>{l}</span>) : <span className="wkl none">—</span>}
            </div>
          ))}
        </div>
        <Link className="edit more" href={`/c/${client.id}/gantt`}>לצפייה בגאנט המלא <Chevron dir="forward" size={13} /></Link>
      </section>

      {soon.length > 0 && (
        <section className="sec">
          <div className="label dotted">בקרוב</div>
          <div className="note">
            {soon.map((s) => (
              <div key={s.key} className="soon"><b className="w500">{s.title}</b><span className="txt num">{s.when}</span></div>
            ))}
          </div>
        </section>
      )}

      {msgs.length > 0 && (
        <section className="sec">
          <div className="sechead"><div className="label dotted">פניות אחרונות</div><Link className="edit more" href={`/c/${client.id}/requests`}>לכל הפניות <Chevron dir="forward" size={13} /></Link></div>
          <div className="note">
            {msgs.slice(0, 3).map((m) => (
              <Link key={m.id} href={`/c/${client.id}/requests?f=${m.status === "done" ? "done" : m.status === "to_meeting" ? "meeting" : "open"}`} className="soon">
                <span>“{m.body.length > 34 ? m.body.slice(0, 34) + "…" : m.body}”</span>
                <span className={`rstatus ${m.status}`}>{REQUEST_STATUS[m.status]}{m.status === "done" ? " ✓" : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {updates.length > 0 && (
        <section className="sec">
          <div className="label dotted">עדכונים אחרונים</div>
          <ul className="updates">
            {updates.map((u, i) => <li key={i}>{u.href ? <Link href={u.href}>{u.text}</Link> : u.text}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}
