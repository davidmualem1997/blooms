"use client";

import { useState, useTransition } from "react";
import { deleteOneOff, mediaUrl, saveOneOffStory, setStoryDoneOn } from "../gantt/actions";
import { MONTHS, WEEKDAYS, parseISODate } from "@/lib/dates";
import { uploadMedia } from "@/lib/media-client";
import { Sheet } from "@/components/sheet";
import { saveMedia } from "@/lib/share-media";

type Media = { path: string; thumb: string | null; kind: string };
export type Story = { ref: string; id: string; title: string; recurring: boolean; media: Media[]; done: boolean };
export type StoryDay = { date: string; stories: Story[] };

// בלי תאריכים במספרים – רק היום / מחר / שם היום
const dayTitle = (d: string, today: string, i: number) =>
  d === today ? "היום" : i === 1 ? "מחר" : `יום ${WEEKDAYS[parseISODate(d).getUTCDay()]}`;

export function StoriesBoard({ clientId, studioId, days, thumbs, today, canEdit }: {
  clientId: string; studioId: string; days: StoryDay[]; thumbs: Record<string, string>; today: string; canEdit: boolean;
}) {
  const [open, setOpen] = useState<{ day: string; story: Story } | null>(null);
  const [adding, setAdding] = useState<{ date: string; story?: Story } | null>(null);
  const [, start] = useTransition();

  return (
    <>
      <div className="stories">
        {days.map((d, i) => (
          <section key={d.date} className="sday-row">
            <div className="sechead">
              <b className="w500">{dayTitle(d.date, today, i)}</b>
              {canEdit && <button className="edit" onClick={() => setAdding({ date: d.date })}>+ סטורי</button>}
            </div>
            {/* סטוריז קבועים: רשימת סימון – עלה / לא עלה */}
            {d.stories.some((s) => s.recurring) && (
              <div className="note">
                {d.stories.filter((s) => s.recurring).map((s) => (
                  <div key={s.ref} className={`task${s.done ? " done" : ""}`}>
                    <button className="box" aria-pressed={s.done} aria-label={s.done ? "עלה" : "לא עלה"} disabled={!canEdit}
                      onClick={() => start(() => setStoryDoneOn(clientId, s.ref, d.date, !s.done))}>✓</button>
                    <span className="tt">{s.title}</span>
                    <span className="txt">{s.done ? "עלה" : "קבוע"}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="story-strip">
              {d.stories.filter((s) => !s.recurring).map((s) => {
                const thumb = s.media[0]?.thumb ? thumbs[s.media[0].thumb] : undefined;
                return (
                  <div key={s.ref} className="story-wrap">
                    <button className={`story${s.done ? " done" : ""}${s.recurring ? " rec" : ""}`} onClick={() => setOpen({ day: d.date, story: s })}
                      style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} aria-label={s.title}>
                      <span className="story-title">{s.title}</span>
                      {s.recurring && <span className="story-badge">קבוע</span>}
                    </button>
                    {/* הורדה ישר מהכרטיס */}
                    {s.media.length > 0 && (
                      <button className="story-dl" aria-label="הורדת הסטורי" onClick={async () => { for (const m of s.media) await saveMedia(m.path); }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></svg>
                      </button>
                    )}
                    {/* סימון "עלה" ישר על הסטורי, בלי לפתוח אותו */}
                    <button className={`story-tick${s.done ? " on" : ""}`} aria-pressed={s.done} aria-label={s.done ? "עלה – ביטול הסימון" : "סימון שעלה"} disabled={!canEdit}
                      onClick={() => start(() => setStoryDoneOn(clientId, s.ref, d.date, !s.done))}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </button>
                  </div>
                );
              })}
              {!d.stories.length && <span className="txt">אין סטוריז</span>}
            </div>
          </section>
        ))}
      </div>
      {canEdit && <button className="fab" aria-label="סטורי חדש" onClick={() => setAdding({ date: today })}>+</button>}

      {open && (
        <Sheet onClose={() => setOpen(null)} label={open.story.title}>
          <h2>{open.story.title}</h2>
          <div className="txt">{dayTitle(open.day, today, 0)} · {open.story.recurring ? "סטורי קבוע (מנוהל בגאנט)" : "סטורי חד-פעמי"}</div>
          {open.story.media.length > 0 && (
            <div className="media-strip">
              {open.story.media.map((m) => (
                <button key={m.path} type="button" className="mtile tall" onClick={async () => { const u = await mediaUrl(m.path); if (u) window.open(u, "_blank"); }} aria-label="הורדה">
                  {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני */}
                  {m.thumb && thumbs[m.thumb] ? <img src={thumbs[m.thumb]} alt="" /> : <span className="mph">{m.kind === "video" ? "סרטון" : "תמונה"}</span>}
                  <span className="mdl">הורדה</span>
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="acts2">
              {!open.story.recurring
                ? <button className="tbtn danger" onClick={() => start(async () => { await deleteOneOff(clientId, open.story.id); setOpen(null); })}>מחיקה</button>
                : <span />}
              <span className="row-gap">
                {!open.story.recurring && <button className="tbtn" onClick={() => { setAdding({ date: open.day, story: open.story }); setOpen(null); }}>עריכה</button>}
                <button className="pbtn" onClick={() => start(async () => { await setStoryDoneOn(clientId, open.story.ref, open.day, !open.story.done); setOpen(null); })}>
                  {open.story.done ? "ביטול הסימון" : "סימון שעלה ✓"}
                </button>
              </span>
            </div>
          )}
        </Sheet>
      )}
      {adding && (
        <StorySheet clientId={clientId} studioId={studioId} date={adding.date} story={adding.story} onClose={() => setAdding(null)} />
      )}
    </>
  );
}

function StorySheet({ clientId, studioId, date, story, onClose }: { clientId: string; studioId: string; date: string; story?: Story; onClose: () => void }) {
  const [media, setMedia] = useState<Media[]>(story?.media ?? []);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const entries = await Promise.all(Array.from(files).map((f) => uploadMedia(f, studioId, clientId, () => {})));
      setMedia((m) => [...m, ...entries]);
    } finally {
      setBusy(false);
    }
  }
  const d = parseISODate(date);
  return (
    <Sheet onClose={onClose} label="סטורי" busy={pending || busy}>
      <form className="stack" action={(fd) => start(async () => {
        await saveOneOffStory(clientId, { id: story?.id, date: String(fd.get("date")) || date, title: String(fd.get("title") ?? ""), media });
        onClose();
      })}>
        <h2>{story ? "עריכת סטורי" : "סטורי חדש"}</h2>
        <input name="title" placeholder="על מה הסטורי? למשל: הספיישל של השבוע" defaultValue={story?.title} aria-label="נושא" required autoFocus />
        <label className="field"><span className="label">תאריך · {WEEKDAYS[d.getUTCDay()]} {d.getUTCDate()} ב{MONTHS[d.getUTCMonth()]}</span><input type="date" name="date" defaultValue={date} /></label>
        <div className="media-strip">
          {media.map((m) => (
            <div key={m.path} className="mtile tall"><span className="mph">{m.kind === "video" ? "סרטון" : "תמונה"} ✓</span>
              <button type="button" className="mx" aria-label="הסרה" onClick={() => setMedia((x) => x.filter((y) => y.path !== m.path))}>×</button></div>
          ))}
          <label className="mtile tall add"><input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
            <span>{busy ? "…" : "+"}</span><small>תמונה או סרטון</small></label>
        </div>
        <div className="acts2"><span /><button className="pbtn" disabled={pending || busy}>שמירה</button></div>
      </form>
    </Sheet>
  );
}
