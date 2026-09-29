import Link from "next/link";
import { getContext } from "@/lib/context";
import { MONTHS, WEEKDAYS, formatIL, parseISODate, todayIL, toISODate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "פעילות · BLOOMS" };

type Row = { id: string; client_id: string; text: string; url: string; staff_only: boolean; created_at: string; actor_id: string | null };

function dayLabel(date: string, today: string) {
  const yesterday = toISODate(new Date(parseISODate(today).getTime() - 864e5));
  if (date === today) return "היום";
  if (date === yesterday) return "אתמול";
  const d = parseISODate(date);
  return `יום ${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]}`;
}

// פיד פעילות: כל מה שקרה אצל הלקוחות, מהחדש לישן. מה שכל אחד רואה נקבע ב-RLS
// (לקוח רואה רק את העסק שלו ובלי העבודה הפנימית של הצוות)
export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const ctx = await getContext();
  const filter = typeof sp.c === "string" && ctx.clients.some((c) => c.id === sp.c) ? sp.c : null;
  const ids = filter ? [filter] : ctx.clients.map((c) => c.id);
  const supabase = await createClient();
  const [{ data }, { data: me }] = await Promise.all([
    ids.length
      ? supabase.from("activity").select("id, client_id, text, url, staff_only, created_at, actor_id").in("client_id", ids).order("created_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("activity_seen_at").eq("id", ctx.userId).single(),
  ]);
  const rows = (data ?? []) as Row[];
  const seenAt = me?.activity_seen_at ?? "";
  const client = new Map(ctx.clients.map((c) => [c.id, c]));
  const today = todayIL();

  const days: { date: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const date = formatIL(r.created_at).date;
    if (days.at(-1)?.date !== date) days.push({ date, rows: [] });
    days.at(-1)!.rows.push(r);
  }

  return (
    <div className="sec">
      <MarkSeen />
      <h1 className="display-title">פעילות</h1>
      {ctx.clients.length > 1 && (
        <nav className="ftabs" aria-label="סינון לפי לקוח">
          <Link href="/activity" className="ftab" aria-current={!filter ? "page" : undefined}>הכול</Link>
          {ctx.clients.map((c) => <Link key={c.id} href={`?c=${c.id}`} className="ftab" aria-current={filter === c.id ? "page" : undefined}>{c.name}</Link>)}
        </nav>
      )}
      {days.map((d) => (
        <section key={d.date} className="stack tight">
          <div className="label dotted">{dayLabel(d.date, today)}</div>
          <div className="note actlist">
            {d.rows.map((r) => {
              const fresh = r.created_at > seenAt && r.actor_id !== ctx.userId;
              const body = (
                <>
                  <span className="actdot" style={{ background: client.get(r.client_id)?.color }} aria-hidden="true" />
                  <span className="actbody">
                    <span className="actmeta">{client.get(r.client_id)?.name}{r.staff_only && ctx.role !== "client" ? " · פנימי" : ""}</span>
                    <span>{r.text}</span>
                  </span>
                  <span className="txt num acttime">{formatIL(r.created_at).time}</span>
                </>
              );
              return r.url
                ? <Link key={r.id} href={r.url} className={`actrow${fresh ? " fresh" : ""}`}>{body}</Link>
                : <div key={r.id} className={`actrow${fresh ? " fresh" : ""}`}>{body}</div>;
            })}
          </div>
        </section>
      ))}
      {!rows.length && <p className="txt">עוד אין פעילות. כל מה שיקרה אצל הלקוחות – תכנים, אישורים, פניות ופגישות – יופיע כאן.</p>}
    </div>
  );
}
