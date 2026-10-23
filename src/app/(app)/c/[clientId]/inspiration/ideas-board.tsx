"use client";

import { useState, useTransition } from "react";
import { ItemEditor, type EditorTarget } from "@/components/item-editor";
import { Sheet } from "@/components/sheet";
import type { Idea } from "@/lib/types";
import { addIdea, deleteIdea, updateIdea } from "./actions";

type Props = { clientId: string; studioId: string; month: string; today: string; ideas: Idea[]; images: Record<string, string> };

const fixUrl = (u: string) => (!u ? "" : /^https?:\/\//.test(u) ? u : `https://${u}`);

export function IdeasBoard(p: Props) {
  const [open, setOpen] = useState<Idea | "new" | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState<{ title: string; url: string }>({ title: "", url: "" });
  // פותח את הטופס המלא (פירוט, קישור…) – עם מה שכבר נכתב בשורה. קישור שהודבק עובר לשדה הקישור
  function add() {
    const raw = draft.trim();
    const url = raw.match(/https?:\/\/\S+|(?:www\.)?(?:instagram|tiktok|pinterest|pin)\.[a-z.]+\/\S+/i)?.[0] ?? "";
    setPreset({ title: raw.replace(url, "").trim(), url });
    setDraft("");
    setOpen("new");
  }

  return (
    <>
      <section className="sec">
        <div className="label dotted">רעיונות</div>
        {/* הוספה כמו ב"דגשים לחודש": כותבים ולוחצים Enter. קישור לריל/פין נשמר, והתמונה נלקחת ממנו */}
        <form className="note reminders" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="rem new">
            <button type="button" className="rem-plus" aria-label="רעיון חדש – כל הפרטים" onClick={add}>+</button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="רעיון חדש…" aria-label="רעיון חדש" enterKeyHint="next" />
          </div>
        </form>
        {p.ideas.length ? (
          <div className="ideas">
            {p.ideas.map((d) => {
              const img = d.image_path ? p.images[d.image_path] : undefined;
              return (
                <button key={d.id} className={`idea${d.used ? " used" : ""}`} onClick={() => setOpen(d)}>
                  <span className={`pic${d.url ? " link" : ""}`} style={img ? { backgroundImage: `url(${img})` } : undefined}>
                    {!img && d.title}
                    {d.source === "client" && <span className="ctag">רעיון לקוח</span>}
                  </span>
                  <span className="ibody">
                    <b className="w500">{d.title}</b>
                    {d.note && <span className="inote">{d.note}</span>}
                    {d.author && <span className="txt">נכתב על ידי {d.author}</span>}
                    {d.used && <span className="used-tag">בגאנט ✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {open && (
        <IdeaSheet {...p} idea={open === "new" ? null : open} preset={preset} onClose={() => setOpen(null)}
          onToGantt={(d) => {
            setOpen(null);
            const date = p.month.slice(0, 7) === p.today.slice(0, 7) ? p.today : p.month;
            setEditor({ date, preset: { title: d.title, notes: [d.note, d.url].filter(Boolean).join("\n") } });
          }} />
      )}
      {editor && <ItemEditor clientId={p.clientId} studioId={p.studioId} thumbs={{}} target={editor} onClose={() => setEditor(null)} />}
    </>
  );
}

function IdeaSheet({ clientId, month, images, idea, preset, onClose, onToGantt }: Props & {
  idea: Idea | null; preset: { title: string; url: string }; onClose: () => void; onToGantt: (d: Idea) => void;
}) {
  const preview = idea?.image_path ? images[idea.image_path] : undefined;
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Sheet onClose={onClose} label={idea ? "רעיון" : "רעיון חדש"} busy={pending}>
      <form className="stack" action={(fd) => {
        const input = { title: String(fd.get("title") ?? ""), note: String(fd.get("note") ?? ""), url: fixUrl(String(fd.get("url") ?? "").trim()), image_path: null };
        start(async () => {
          if (idea) await updateIdea(clientId, idea.id, input);
          else await addIdea(clientId, month, input);
          onClose();
        });
      }}>
        {preview && <div className="drop pick" style={{ backgroundImage: `url(${preview})` }} />}
        <input name="title" placeholder="הרעיון" defaultValue={idea?.title ?? preset.title} aria-label="הרעיון" autoFocus={!idea && !preset.title} />
        <textarea name="note" rows={4} placeholder="איך לצלם, מה לכתוב…" defaultValue={idea?.note} aria-label="פירוט" />
        <input name="url" dir="ltr" placeholder="קישור לריל, לטיקטוק או לפין" defaultValue={idea?.url ?? preset.url} aria-label="קישור" />
        <span className="txt">התמונה הראשית נלקחת אוטומטית מהקישור.{idea?.author ? ` נכתב על ידי ${idea.author}.` : ""}</span>
        {idea?.url && <a className="txt strong" href={fixUrl(idea.url)} target="_blank" rel="noopener">פתיחת הקישור</a>}
        <div className="acts2">
          <span className="row-gap">
            {idea && <button type="button" className="tbtn danger" disabled={pending}
              onClick={() => (sure ? start(async () => { await deleteIdea(clientId, idea.id); onClose(); }) : setSure(true))}>
              {sure ? "בטוח?" : "מחיקה"}</button>}
            {idea && <button type="button" className="tbtn" disabled={pending}
              onClick={() => start(async () => { await updateIdea(clientId, idea.id, { used: true }); onToGantt(idea); })}>
              {idea.used ? "שוב לגאנט" : "העברה לגאנט"}</button>}
          </span>
          <button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירה"}</button>
        </div>
      </form>
    </Sheet>
  );
}
