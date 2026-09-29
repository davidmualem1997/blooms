"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { MONTHS, WEEKDAYS, formatIL, parseISODate } from "@/lib/dates";
import { uploadMedia } from "@/lib/media-client";
import type { Brand, ClientEvent, Meeting, Message, Task } from "@/lib/types";
import { mediaUrl } from "../gantt/actions";
import {
  addMeeting, addTask, deleteEvent, deleteMeeting, deleteTask, saveEvent, saveSummary, setMeetingTopics, updateBrand, updateTask,
} from "./actions";

export type FileTab = "general" | "brand" | "ops" | "events" | "meetings" | "contacts" | "settings";
const TABS: { k: FileTab; l: string }[] = [
  { k: "general", l: "כללי" }, { k: "brand", l: "מותג" }, { k: "ops", l: "תפעול" },
  { k: "events", l: "אירועים" }, { k: "meetings", l: "פגישות" }, { k: "contacts", l: "אנשי קשר" },
];

type Props = {
  clientName: string;
  initialTab: FileTab;
  settings?: React.ReactNode; // "הגדרות" – רק למנהלת הסטודיו
  clientId: string;
  studioId: string;
  brand: Brand;
  isStaff: boolean;
  isVenue: boolean; // מסעדה או חנות – מציגים גם הזמנת מקום, תפריט וניווט
  userId: string;
  team: { id: string; name: string }[];
  tasks: Task[];
  meetings: Meeting[];
  events: ClientEvent[];
  openMessages: Message[];
  images: Record<string, string>;
  today: string;
};

type Field = { k: string; label: string; value?: string; type?: "text" | "area" | "url" | "tel" | "email" | "color" | "date" | "time" | "select"; options?: string[]; rows?: number; placeholder?: string };
type FormState = { title: string; fields: Field[]; onSave: (v: Record<string, string>) => Promise<void> | void } | null;

const KIND_LABEL = { meet: "פגישה", call: "שיחת טלפון", zoom: "זום" } as const;
const lines = (s?: string) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const fixUrl = (u: string) => (!u ? "" : /^https?:\/\//.test(u) ? u : `https://${u}`);
const copy = (t: string) => navigator.clipboard?.writeText(t);
// שם קצר מתחת לאייקון ("קאנבה – דרושים" ← "דרושים"); השם המלא מופיע בריחוף
const shortLabel = (l: string) => { const s = l.split(/\s[–-]\s/).at(-1) ?? l; return s.length > 12 ? s.slice(0, 11) + "…" : s; };
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const ICONS: Record<string, React.ReactNode> = {
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /></>,
  tiktok: <><path d="M14 4v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.5 2.5 2.5 4 5 4" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />,
  website: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></>,
  photos: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8.5" /></>,
  canva: <><circle cx="12" cy="12" r="8.5" /><path d="M15 9.5a3.5 3.5 0 1 0 0 5" /></>,
  pinterest: <><path d="M12 21v-6" /><path d="M8 3h8l-1 5 3 4H6l3-4z" /></>,
  drive: <path d="M8 4h8l5 9-4 7H7l-4-7z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};
const iconFor = (label: string, url: string) =>
  /קאנבה|canva/i.test(label + url) ? "canva" : /פינטרסט|pin/i.test(label + url) ? "pinterest"
  : /גוגל תמונות|photos|pixieset|תמונות/i.test(label + url) ? "photos" : /דרייב|drive/i.test(label + url) ? "drive" : "link";

// תיק לקוח כ-Client Hub: טאבים ברורים במקום גלילה ארוכה אחת
export function ClientFile(p: Props) {
  const [tab, setTab] = useState<FileTab>(p.initialTab);
  const [form, setForm] = useState<FormState>(null);
  const [summaryFor, setSummaryFor] = useState<Meeting | null>(null);
  const [eventFor, setEventFor] = useState<ClientEvent | "new" | null>(null);
  const [editLinks, setEditLinks] = useState(false);
  const [, start] = useTransition();
  const b = p.brand;
  const patch = (x: Partial<Brand>) => start(() => updateBrand(p.clientId, x));
  const teamName = (id: string | null) => p.team.find((t) => t.id === id)?.name ?? "לא שויך";
  const pre = (t?: string) => (t ? <p className="pre">{t}</p> : <span className="txt">עוד לא מולא</span>);

  const sorted = [...p.meetings].sort((a, c) => a.starts_at.localeCompare(c.starts_at));
  const next = sorted.find((m) => !m.summary && formatIL(m.starts_at).date >= p.today);
  const past = sorted.filter((m) => m !== next).reverse();

  const socials: { key: keyof NonNullable<Brand["socials"]>; label: string }[] = [
    { key: "instagram", label: "אינסטגרם" }, { key: "tiktok", label: "טיקטוק" }, { key: "facebook", label: "פייסבוק" }, { key: "website", label: "אתר" },
  ];
  const acc = (title: string, keys: (keyof Brand)[], labels: string[], body: React.ReactNode, open = false) => (
    <details className="acc" open={open}>
      <summary>{title}</summary>
      <div className="accb">
        {body}
        <button className="edit" onClick={() => setForm({
          title,
          fields: keys.map((k, i) => ({ k, label: labels[i], value: (b[k] as string) ?? "", type: "area", rows: k === "story" ? 10 : 5 })),
          onSave: (v) => patch(v as Partial<Brand>),
        })}>עריכה</button>
      </div>
    </details>
  );

  const tabs = p.settings ? [...TABS, { k: "settings" as const, l: "הגדרות" }] : TABS;
  const main = b.contacts?.[0];
  const summary = (b.story ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" ");

  return (
    <>
      <div className="phead">
        <h1 className="display-title">{p.clientName}</h1>
        <div className="txt">תיק לקוח · מידע ומסמכים</div>
      </div>
      <nav className="ftabs" aria-label="חלקי תיק הלקוח">
        {tabs.map((t) => (
          <button key={t.k} aria-current={tab === t.k ? "page" : undefined} onClick={() => { setTab(t.k); history.replaceState(null, "", `?tab=${t.k}`); }}>{t.l}</button>
        ))}
      </nav>

      {tab === "general" && (<>
      {/* קישורים מהירים: רשתות, תמונות וחומרים */}
      <div className="quick">
        {socials.map((q) => {
          const url = b.socials?.[q.key];
          const icon = <i><Svg>{ICONS[q.key]}</Svg></i>;
          return url ? (
            <a key={q.key} className="q" href={fixUrl(url)} target="_blank" rel="noopener">{icon}{q.label}</a>
          ) : (
            <button key={q.key} className="q off" onClick={() => setForm({
              title: `קישור ל${q.label}`, fields: [{ k: "url", label: "קישור", type: "url", placeholder: "https://" }],
              onSave: (v) => { if (v.url) patch({ socials: { ...b.socials, [q.key]: fixUrl(v.url) } }); },
            })}>{icon}{q.label}</button>
          );
        })}
        {(b.materials ?? []).map((l, ix) => {
          const icon = <i><Svg>{ICONS[iconFor(l.label, l.url)]}</Svg></i>;
          const del = editLinks && <button className="qx" aria-label={`מחיקת ${l.label}`} onClick={() => patch({ materials: (b.materials ?? []).filter((_, j) => j !== ix) })}>×</button>;
          return l.url && !editLinks ? (
            <a key={ix} className="q" href={fixUrl(l.url)} target="_blank" rel="noopener" title={l.label}>{icon}<span>{shortLabel(l.label)}</span></a>
          ) : (
            <span key={ix} className="qwrap">
              <button className={`q${l.url ? "" : " off"}`} onClick={() => setForm({
                title: l.label, fields: [{ k: "label", label: "שם", value: l.label }, { k: "url", label: "קישור", type: "url", value: l.url }],
                onSave: (v) => patch({ materials: (b.materials ?? []).map((x, j) => (j === ix ? { label: v.label || x.label, url: fixUrl(v.url) } : x)) }),
              })} title={l.label}>{icon}<span>{shortLabel(l.label)}</span></button>
              {del}
            </span>
          );
        })}
        <button className="q off" onClick={() => setForm({
          title: "קישור חדש",
          fields: [{ k: "label", label: "שם", placeholder: "למשל: קאנבה – תפריט" }, { k: "url", label: "קישור", type: "url", placeholder: "https://" }],
          onSave: (v) => { if (v.label || v.url) patch({ materials: [...(b.materials ?? []), { label: v.label || "קישור", url: fixUrl(v.url) }] }); },
        })}><i><Svg><path d="M12 5v14M5 12h14" /></Svg></i>הוספה</button>
      </div>
      {(b.materials ?? []).length > 0 && <button className="edit qedit" onClick={() => setEditLinks((e) => !e)}>{editLinks ? "סיום עריכה" : "עריכת קישורים"}</button>}

      <section className="sec">
        <div className="label dotted">על העסק</div>
        <div className="card">
          {summary ? <p className="pre">{summary.length > 260 ? summary.slice(0, 257) + "…" : summary}</p> : <span className="txt">עוד לא נכתב סיפור</span>}
          <button className="edit" onClick={() => setTab("brand")}>לסיפור המלא ולספר המותג</button>
        </div>
      </section>

      {main && (
        <section className="sec">
          <div className="label dotted">איש קשר ראשי</div>
          <div className="card contact">
            <b className="w500">{main.name}{main.role ? ` · ${main.role}` : ""}</b>
            {main.phone && <div className="ln"><span dir="ltr">{main.phone}</span><button className="txt strong" onClick={() => copy(main.phone!)}>העתקה</button></div>}
            {main.email && <div className="ln"><span dir="ltr">{main.email}</span><button className="txt strong" onClick={() => copy(main.email!)}>העתקה</button></div>}
            <button className="edit" onClick={() => setTab("contacts")}>כל אנשי הקשר</button>
          </div>
        </section>
      )}

      </>)}
      {tab === "brand" && (<>
      {/* אפיון */}
      <section className="sec">
        <div className="label dotted">אפיון</div>
        <div className="accs">
          {acc("הסיפור", ["story"], [""], pre(b.story))}
          {acc("ערכים", ["values"], ["שורה לכל ערך"], pre(b.values))}
          {acc("קהל יעד", ["audience"], [""], pre(b.audience))}
          {acc("איך מדברים", ["tone", "dos", "donts", "examples"], ["טון", "כן (שורה לכל כלל)", "לא (שורה לכל כלל)", "איך זה נשמע"], (
            <>
              {pre(b.tone)}
              {lines(b.dos).length > 0 && <><div className="label">כן</div><div className="rules">{lines(b.dos).map((x) => <span key={x} className="rule yes">{x}</span>)}</div></>}
              {lines(b.donts).length > 0 && <><div className="label">לא</div><div className="rules">{lines(b.donts).map((x) => <span key={x} className="rule no">{x}</span>)}</div></>}
              {b.examples && <><div className="label">איך זה נשמע</div>{pre(b.examples)}</>}
            </>
          ))}
          <details className="acc">
            <summary>שאלות ותשובות נפוצות ({b.faq?.length ?? 0})</summary>
            <div className="accb">
              {(b.faq ?? []).map((f, ix) => (
                <div key={ix} className="qa">
                  <b className="w500">{f.q}</b>
                  <p className="pre sub">{f.a}</p>
                  <div className="acts">
                    <button className="txt strong" onClick={() => copy(f.a)}>העתקת תשובה</button>
                    <button className="txt" onClick={() => patch({ faq: (b.faq ?? []).filter((_, j) => j !== ix) })}>מחיקה</button>
                  </div>
                </div>
              ))}
              <button className="edit" onClick={() => setForm({
                title: "תשובה חדשה", fields: [{ k: "q", label: "השאלה" }, { k: "a", label: "התשובה", type: "area" }],
                onSave: (v) => { if (v.q && v.a) patch({ faq: [...(b.faq ?? []), { q: v.q, a: v.a }] }); },
              })}>תשובה חדשה</button>
            </div>
          </details>
          {acc("פעולות שיווקיות קבועות", ["recurring"], [""], pre(b.recurring))}
        </div>
      </section>

      </>)}
      {tab === "ops" && (<>
      {/* שעות פתיחה, ולמסעדה או חנות גם הזמנת מקום, תפריט וניווט */}
      <section className="sec">
        <div className="card">
          <div className="sechead"><div className="label dotted">שעות פתיחה</div>
            <button className="edit" onClick={() => setForm({
              title: p.isVenue ? "שעות פתיחה והזמנות" : "שעות פתיחה",
              fields: [
                { k: "hours", label: "שעות פתיחה", type: "area", value: b.hours },
                ...(p.isVenue ? [
                  { k: "reserve_url", label: "קישור להזמנת מקום", type: "url" as const, value: b.booking?.reserve_url },
                  { k: "reserve_phone", label: "טלפון להזמנת מקום", type: "tel" as const, value: b.booking?.reserve_phone },
                  { k: "menu_url", label: "קישור לתפריט", type: "url" as const, value: b.booking?.menu_url },
                  { k: "waze_url", label: "קישור לוויז", type: "url" as const, value: b.booking?.waze_url },
                  { k: "google_url", label: "קישור לגוגל ביזנס", type: "url" as const, value: b.booking?.google_url },
                ] : []),
              ],
              onSave: (v) => patch({
                hours: v.hours,
                ...(p.isVenue ? { booking: { reserve_url: fixUrl(v.reserve_url), reserve_phone: v.reserve_phone, menu_url: fixUrl(v.menu_url), waze_url: fixUrl(v.waze_url), google_url: fixUrl(v.google_url) } } : {}),
              }),
            })}>עריכה</button></div>
          {pre(b.hours)}
          {p.isVenue && (
            <div className="venue">
              {b.booking?.reserve_url && <a className="vbtn" href={b.booking.reserve_url} target="_blank" rel="noopener">הזמנת מקום</a>}
              {b.booking?.reserve_phone && <button className="vbtn" onClick={() => copy(b.booking!.reserve_phone!)}><span dir="ltr">{b.booking.reserve_phone}</span> · העתקה</button>}
              {b.booking?.menu_url && <a className="vbtn" href={b.booking.menu_url} target="_blank" rel="noopener">תפריט</a>}
              {b.booking?.waze_url && <a className="vbtn" href={b.booking.waze_url} target="_blank" rel="noopener">וויז</a>}
              {b.booking?.google_url && <a className="vbtn" href={b.booking.google_url} target="_blank" rel="noopener">גוגל ביזנס</a>}
              {!b.booking?.reserve_url && !b.booking?.menu_url && !b.booking?.reserve_phone && <span className="txt">אפשר להוסיף הזמנת מקום, תפריט, וויז וגוגל ביזנס בעריכה.</span>}
            </div>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="card">
          <div className="sechead"><div className="label dotted">פרטים תפעוליים קבועים</div>
            <button className="edit" onClick={() => setForm({
              title: "פרטים תפעוליים קבועים",
              fields: [{ k: "ops", label: "", type: "area", value: b.ops, rows: 6, placeholder: "חניה, נגישות, מדיניות ביטולים, ימי סגירה קבועים, כשרות…" }],
              onSave: (v) => patch({ ops: v.ops }),
            })}>עריכה</button></div>
          {pre(b.ops)}
        </div>
      </section>

      </>)}
      {tab === "brand" && (<>
      <BrandBook p={p} onPatch={patch} />
      </>)}

      {tab === "ops" && (<>
      {/* משימות צוות – רק לצוות */}
      {p.isStaff && (
        <section className="sec">
          <div className="sechead"><div className="label dotted">משימות צוות</div><span className="txt">רק לצוות · {p.tasks.filter((t) => !t.done).length} פתוחות</span></div>
          <div className="note">
            {p.tasks.map((t) => (
              <div key={t.id} className={`task${t.done ? " done" : ""}`}>
                <button className="box" aria-pressed={t.done} aria-label="בוצע" onClick={() => start(() => updateTask(p.clientId, t.id, { done: !t.done }))}>✓</button>
                <span className="tt">{t.title}</span>
                <span className="task-acts">
                  <button className="tag" aria-label={`אחראי: ${teamName(t.assignee_id)}`} onClick={() => {
                    const ix = p.team.findIndex((m) => m.id === t.assignee_id);
                    start(() => updateTask(p.clientId, t.id, { assignee_id: p.team[(ix + 1) % p.team.length].id }));
                  }}>{teamName(t.assignee_id)}</button>
                  <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => deleteTask(p.clientId, t.id))}>×</button>
                </span>
              </div>
            ))}
            <AddLine placeholder="משימה חדשה לצוות" onAdd={(t) => addTask(p.clientId, t, p.userId)} />
          </div>
        </section>
      )}

      </>)}
      {tab === "events" && (<>
      {/* אירועים קרובים */}
      <section className="sec">
        <div className="sechead"><div className="label dotted">אירועים קרובים</div>
          {p.isStaff && <button className="edit" onClick={() => setEventFor("new")}>אירוע חדש</button>}</div>
        {p.events.map((e) => {
          const d = parseISODate(e.date);
          return (
            <div key={e.id} className="evcard">
              <div className="mwhen">
                <div className="mdate"><b className="num">{d.getUTCDate()}</b><span>{MONTHS[d.getUTCMonth()]}</span></div>
                <div className="grow0"><b className="w500">{e.title}</b><div className="txt">יום {WEEKDAYS[d.getUTCDay()]}</div></div>
                {p.isStaff && <button className="edit" onClick={() => setEventFor(e)}>עריכה</button>}
              </div>
              {e.needs_material && <span className="txt w500">{p.isStaff ? "מחכים לחומרים מהלקוח" : "מחכים לחומרים ממך – אפשר לשלוח דרך כפתור הפלוס"}</span>}
              {e.description && <p className="pre">{e.description}</p>}
              <div className="row-gap">
                {e.link && <a className="edit" href={fixUrl(e.link)} target="_blank" rel="noopener">חומרים לאירוע</a>}
                {p.isStaff && <Link className="edit" href={`/c/${p.clientId}/gantt?m=${e.date.slice(0, 7)}`}>יצירת תוכן מהאירוע</Link>}
              </div>
              {(e.images ?? []).length > 0 && (
                <div className="media-strip">
                  {(e.images ?? []).map((im) => (
                    <button key={im.path} type="button" className="mtile" onClick={async () => { const u = await mediaUrl(im.path); if (u) window.open(u, "_blank"); }} aria-label="הורדת התמונה">
                      {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני */}
                      {im.thumb && p.images[im.thumb] ? <img src={p.images[im.thumb]} alt="" /> : <span className="mph">תמונה</span>}
                      <span className="mdl">הורדה</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!p.events.length && <p className="empty">אין אירועים קרובים</p>}
      </section>

      </>)}
      {tab === "meetings" && (<>
      {/* פגישות */}
      <section className="sec">
        <div className="sechead"><div className="label dotted">פגישות</div>
          <button className="edit" onClick={() => setForm({
            title: "קביעת פגישה",
            fields: [
              { k: "kind", label: "סוג", type: "select", options: ["פגישה", "שיחת טלפון", "זום"], value: "פגישה" },
              { k: "date", label: "תאריך", type: "date", value: p.today },
              { k: "time", label: "שעה", type: "time", value: "10:00" },
              { k: "where", label: "מקום או קישור", placeholder: "למשל: בעסק" },
            ],
            onSave: (v) => {
              const kind = v.kind.includes("טלפון") ? "call" : v.kind.includes("זום") ? "zoom" : "meet";
              return addMeeting(p.clientId, kind, v.date || p.today, v.time, v.where);
            },
          })}>קביעת פגישה</button>
        </div>
        {next ? (() => {
          const { date, time } = formatIL(next.starts_at);
          const d = parseISODate(date);
          return (
            <div className="meet">
              <div className="mwhen">
                <div className="mdate"><b className="num">{d.getUTCDate()}</b><span>{MONTHS[d.getUTCMonth()]}</span></div>
                <div>
                  <b className="w500">{KIND_LABEL[next.kind]} · {time}</b>
                  <div className="txt">יום {WEEKDAYS[d.getUTCDay()]}{next.location ? ` · ${next.location}` : ""}</div>
                </div>
              </div>
              <div className="label">נושאים לפגישה</div>
              {p.openMessages.map((m) => (
                <div key={m.id} className="todo"><span className="sdot" style={{ ["--c" as string]: "var(--dot)" }} /><span className="tx"><span className="t">{m.body}</span><span className="tag">מהלקוח</span></span><span /></div>
              ))}
              {next.extra_topics.map((t, ix) => (
                <div key={ix} className="todo"><span className="sdot" style={{ ["--c" as string]: "var(--muted)" }} /><span className="tx"><span className="t">{t}</span></span>
                  <button className="xbtn" aria-label="מחיקה" onClick={() => start(() => setMeetingTopics(p.clientId, next.id, next.extra_topics.filter((_, j) => j !== ix)))}>×</button></div>
              ))}
              {!p.openMessages.length && !next.extra_topics.length && <span className="txt">עוד אין נושאים. בקשות שהלקוח שולח יופיעו כאן לבד.</span>}
              {p.isStaff && <AddLine placeholder="נושא נוסף לפגישה" onAdd={(t) => setMeetingTopics(p.clientId, next.id, [...next.extra_topics, t])} />}
              {p.isStaff && (
                <div className="acts2">
                  <button className="tbtn danger" onClick={() => start(() => deleteMeeting(p.clientId, next.id))}>ביטול פגישה</button>
                  <button className="pbtn" onClick={() => setSummaryFor(next)}>סיכום פגישה</button>
                </div>
              )}
            </div>
          );
        })() : <p className="empty">אין פגישה קבועה</p>}
        {past.length > 0 && (
          <details className="acc">
            <summary>פגישות קודמות ({past.length})</summary>
            <div className="accb">
              {past.map((m) => (
                <div key={m.id} className="mpast">
                  <b className="w500">{formatIL(m.starts_at).date.split("-").reverse().slice(0, 2).join(".")} · {KIND_LABEL[m.kind]}</b>
                  {m.summary ? <p className="pre">{m.summary}</p> : <span className="txt">אין סיכום</span>}
                  {p.isStaff && <button className="edit" onClick={() => setSummaryFor(m)}>{m.summary ? "עריכת סיכום" : "הוספת סיכום"}</button>}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      </>)}
      {tab === "contacts" && (<>
      {/* אנשי קשר – בתחתית */}
      <section className="sec">
        <div className="card">
          <div className="sechead"><div className="label dotted">אנשי קשר</div>
            <button className="edit" onClick={() => setForm({
              title: "איש/אשת קשר",
              fields: [{ k: "name", label: "שם" }, { k: "role", label: "תפקיד" }, { k: "phone", label: "טלפון", type: "tel" }, { k: "email", label: "מייל", type: "email" }],
              onSave: (v) => { if (v.name) patch({ contacts: [...(b.contacts ?? []), { name: v.name, role: v.role, phone: v.phone, email: v.email }] }); },
            })}>הוספה</button></div>
          {(b.contacts ?? []).map((c, ix) => (
            <div key={ix} className="contact">
              <b className="w500">{c.name}{c.role ? ` · ${c.role}` : ""}{ix === 0 && <span className="tag">ראשי</span>}</b>
              {c.phone && <div className="ln"><span dir="ltr">{c.phone}</span><button className="txt strong" onClick={() => copy(c.phone!)}>העתקה</button></div>}
              {c.email && <div className="ln"><span dir="ltr">{c.email}</span><button className="txt strong" onClick={() => copy(c.email!)}>העתקה</button></div>}
              <button className="txt" onClick={() => patch({ contacts: (b.contacts ?? []).filter((_, j) => j !== ix) })}>מחיקה</button>
            </div>
          ))}
          {!b.contacts?.length && <span className="txt">עוד אין אנשי קשר</span>}
        </div>
      </section>

      </>)}
      {tab === "settings" && p.settings}

      {form && <FormSheet form={form} onClose={() => setForm(null)} />}
      {summaryFor && (
        <SummarySheet meeting={summaryFor} openMessages={summaryFor === next ? p.openMessages : []}
          onClose={() => setSummaryFor(null)}
          onSave={(text, resolve) => saveSummary(p.clientId, summaryFor.id, text, resolve)} />
      )}
      {eventFor && <EventSheet p={p} event={eventFor === "new" ? null : eventFor} onClose={() => setEventFor(null)} />}
    </>
  );
}

// ספר מותג: צבעים, פונטים, לוגו, קאבר ואלמנטים עיצוביים
function BrandBook({ p, onPatch }: { p: Props; onPatch: (x: Partial<Brand>) => void }) {
  const b = p.brand;
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<FormState>(null);

  async function upload(kind: "logo" | "cover" | "element", files?: FileList | null) {
    if (!files?.length) return;
    setBusy(kind);
    try {
      const entries = await Promise.all(Array.from(files).map((f) => uploadMedia(f, p.studioId, p.clientId, () => {})));
      if (kind === "logo") onPatch({ logo_path: entries[0].path });
      else if (kind === "cover") onPatch({ cover_path: entries[0].path });
      else onPatch({ elements: [...(b.elements ?? []), ...entries.map((e) => e.path)] });
    } finally {
      setBusy("");
    }
  }
  const img = (path?: string) => (path ? p.images[path] : undefined);

  return (
    <section className="sec">
      <div className="label dotted">ספר מותג</div>
      <div className="brandcard">
        <div className="field"><span className="label">צבעים · לחיצה מעתיקה את הקוד</span>
          <div className="pal">
            {(b.palette ?? []).map((c, ix) => (
              <div key={ix} className="sw">
                <button onClick={() => copy(c.hex.toUpperCase())} aria-label={`העתקת ${c.hex}`}><i style={{ background: c.hex }} /></button>
                <span>{c.name}<br /><code dir="ltr">{c.hex.toUpperCase()}</code></span>
                {p.isStaff && <button className="xbtn" aria-label="מחיקה" onClick={() => onPatch({ palette: (b.palette ?? []).filter((_, j) => j !== ix) })}>×</button>}
              </div>
            ))}
            {p.isStaff && <button className="sw add" onClick={() => setForm({
              title: "צבע חדש", fields: [{ k: "hex", label: "צבע", type: "color", value: "#C4532D" }, { k: "name", label: "שם הצבע" }],
              onSave: (v) => onPatch({ palette: [...(b.palette ?? []), { hex: v.hex, name: v.name || v.hex.toUpperCase() }] }),
            })}><i>+</i><span>צבע</span></button>}
          </div>
        </div>
        <div className="field"><div className="sechead"><span className="label">פונטים</span>
          {p.isStaff && <button className="edit" onClick={() => setForm({ title: "פונטים", fields: [{ k: "fonts", label: "", type: "area", value: b.fonts, placeholder: "כותרות: ...\nטקסט: ..." }], onSave: (v) => onPatch({ fonts: v.fonts }) })}>עריכה</button>}</div>
          {b.fonts ? <p className="pre">{b.fonts}</p> : <span className="txt">עוד לא הוגדרו</span>}
        </div>
        <div className="two">
          <div className="field"><span className="label">לוגו</span>
            <label className={`logo pick${p.isStaff ? "" : " ro"}`} style={img(b.logo_path) ? { backgroundImage: `url(${img(b.logo_path)})` } : undefined}>
              {!img(b.logo_path) && <span>{busy === "logo" ? "…" : "לוגו"}</span>}
              <input type="file" accept="image/*" hidden onChange={(e) => upload("logo", e.target.files)} />
            </label>
          </div>
          {p.isStaff && (
            <div className="field"><span className="label">תמונת קאבר</span>
              <label className="cover pick small" style={img(b.cover_path) ? { backgroundImage: `url(${img(b.cover_path)})` } : undefined}>
                {!img(b.cover_path) && <span className="txt">{busy === "cover" ? "מעלים…" : "הוספת קאבר"}</span>}
                <input type="file" accept="image/*" hidden onChange={(e) => upload("cover", e.target.files)} />
              </label>
            </div>
          )}
        </div>
        <div className="field"><span className="label">אלמנטים עיצוביים</span>
          <div className="media-strip">
            {(b.elements ?? []).map((path) => (
              <div key={path} className="mtile">
                {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני */}
                {img(path) ? <img src={img(path)} alt="" /> : <span className="mph">קובץ</span>}
                <button type="button" className="mdl" onClick={async () => { const u = await mediaUrl(path); if (u) window.open(u, "_blank"); }}>הורדה</button>
                {p.isStaff && <button type="button" className="mx" aria-label="הסרה" onClick={() => onPatch({ elements: (b.elements ?? []).filter((x) => x !== path) })}>×</button>}
              </div>
            ))}
            {p.isStaff && (
              <label className="mtile add">
                <input type="file" accept="image/*" multiple hidden onChange={(e) => upload("element", e.target.files)} />
                <span>{busy === "element" ? "…" : "+"}</span><small>אייקונים, דפוסים, איורים</small>
              </label>
            )}
          </div>
        </div>
      </div>
      {form && <FormSheet form={form} onClose={() => setForm(null)} />}
    </section>
  );
}

function EventSheet({ p, event, onClose }: { p: Props; event: ClientEvent | null; onClose: () => void }) {
  const [images, setImages] = useState(event?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const entries = await Promise.all(Array.from(files).map((f) => uploadMedia(f, p.studioId, p.clientId, () => {})));
      setImages((im) => [...im, ...entries.map((e) => ({ path: e.path, thumb: e.thumb }))]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet onClose={onClose} label="אירוע" busy={pending || busy}>
      <form className="stack" action={(fd) => start(async () => {
        await saveEvent(p.clientId, { id: event?.id, date: String(fd.get("date")) || p.today, title: String(fd.get("title") ?? ""), description: String(fd.get("desc") ?? ""), link: String(fd.get("link") ?? "").trim(), needs_material: fd.get("needs") === "on", images });
        onClose();
      })}>
        <h2>{event ? "עריכת אירוע" : "אירוע חדש"}</h2>
        <input name="title" placeholder="שם האירוע" defaultValue={event?.title} aria-label="שם האירוע" required />
        <label className="field"><span className="label">תאריך</span><input type="date" name="date" defaultValue={event?.date ?? p.today} /></label>
        <label className="field"><span className="label">פרטים והערות</span><textarea name="desc" rows={4} defaultValue={event?.description} placeholder="שעה, מחיר, הרשמה, מה צריך לפרסם" /></label>
        <label className="field"><span className="label">קישור לחומרים</span><input name="link" dir="ltr" defaultValue={event?.link} placeholder="דרייב, קאנבה…" /></label>
        <label className="chk"><input type="checkbox" name="needs" defaultChecked={event?.needs_material} /> מחכים לחומרים מהלקוח (נשלחת לו תזכורת כמה ימים לפני)</label>
        <div className="field"><span className="label">תמונות לפרסום</span>
          <div className="media-strip">
            {images.map((im) => (
              <div key={im.path} className="mtile"><span className="mph">תמונה</span>
                <button type="button" className="mx" aria-label="הסרה" onClick={() => setImages((all) => all.filter((x) => x.path !== im.path))}>×</button></div>
            ))}
            <label className="mtile add"><input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => add(e.target.files)} /><span>{busy ? "…" : "+"}</span><small>תמונה או סרטון</small></label>
          </div>
        </div>
        <div className="acts2">
          {event ? <button type="button" className="tbtn danger" onClick={() => start(async () => { await deleteEvent(p.clientId, event.id); onClose(); })}>מחיקה</button> : <span />}
          <button className="pbtn" disabled={pending || busy}>שמירה</button>
        </div>
      </form>
    </Sheet>
  );
}

function FormSheet({ form, onClose }: { form: NonNullable<FormState>; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Sheet onClose={onClose} label={form.title} busy={pending}>
      <form className="stack" action={(fd) => {
        const v = Object.fromEntries(form.fields.map((f) => [f.k, String(fd.get(f.k) ?? "").trim()]));
        start(async () => { await form.onSave(v); onClose(); });
      }}>
        <h2>{form.title}</h2>
        {form.fields.map((f) => (
          <label key={f.k} className="field">
            {f.label && <span className="label">{f.label}</span>}
            {f.type === "select"
              ? <select name={f.k} defaultValue={f.value}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
              : f.type === "area"
              ? <textarea name={f.k} defaultValue={f.value} rows={f.rows ?? 5} placeholder={f.placeholder} />
              : <input name={f.k} type={f.type ?? "text"} defaultValue={f.value} placeholder={f.placeholder}
                  dir={["url", "tel", "email"].includes(f.type ?? "") ? "ltr" : undefined} />}
          </label>
        ))}
        <div className="acts2"><span /><button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירה"}</button></div>
      </form>
    </Sheet>
  );
}

function SummarySheet({ meeting, openMessages, onClose, onSave }: {
  meeting: Meeting; openMessages: Message[]; onClose: () => void; onSave: (text: string, resolve: string[]) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [resolve, setResolve] = useState(true);
  return (
    <Sheet onClose={onClose} label="סיכום פגישה" busy={pending}>
      <form className="stack" action={(fd) => {
        const text = String(fd.get("summary") ?? "").trim();
        start(async () => { await onSave(text, resolve && text ? openMessages.map((m) => m.id) : []); onClose(); });
      }}>
        <h2>סיכום פגישה</h2>
        <textarea name="summary" rows={9} defaultValue={meeting.summary} placeholder="מה סוכם, מה הלאה, מי אחראי על מה" />
        {openMessages.length > 0 && (
          <label className="chk"><input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
            לסמן את {openMessages.length} הבקשות של הלקוח כטופלו</label>
        )}
        <div className="acts2"><span /><button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירה"}</button></div>
      </form>
    </Sheet>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <form className="addrow" action={(fd) => { const t = String(fd.get("t") ?? "").trim(); if (t) start(() => onAdd(t)); }}>
      <input name="t" placeholder={placeholder} aria-label={placeholder} disabled={pending} autoComplete="off" />
    </form>
  );
}

// מיתוג: תמונת קאבר ולוגו לפורטל, ותחום הלקוח (קובע אילו ימים מיוחדים יופיעו בלוח)
