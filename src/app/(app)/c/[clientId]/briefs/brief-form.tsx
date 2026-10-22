"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveBrief, type BriefInput, type Equipment, type Shot } from "./actions";

const lines = (s: FormDataEntryValue | null) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const fixUrl = (u: string) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);
const isUrl = (u: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(u.trim());

// בריף צילומים: לוח השראה, מתי ואיפה, ורשימת צילומים כצ'ק ליסט (תיאור + קישור להשראה + תחושה).
// אפשר לצאת בכל רגע: "שמירה כטיוטה" או "ביטול"
export function BriefForm({ clientId, brief }: { clientId: string; brief?: BriefInput }) {
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [shots, setShots] = useState<Shot[]>(brief?.shots?.length ? brief.shots : [{ text: "" }]);
  const [from = "", to = ""] = (brief?.time_text ?? "").split(/\s*[–-]\s*/);
  const equipText = (brief?.equipment ?? []).map((e) => (e.who ? `${e.text} - ${e.who}` : e.text)).join("\n");
  const set = (i: number, patch: Partial<Shot>) => setShots((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function save(status: "draft" | "final") {
    const fd = new FormData(form.current!);
    const t1 = String(fd.get("from") ?? ""), t2 = String(fd.get("to") ?? "");
    start(() => saveBrief({
      id: brief?.id, client_id: clientId, status,
      title: String(fd.get("title") ?? ""),
      vision_board: String(fd.get("vision_board") ?? "").trim(),
      shoot_date: String(fd.get("shoot_date") ?? "") || null,
      time_text: t1 && t2 ? `${t1}–${t2}` : t1 || t2,
      location: String(fd.get("location") ?? ""),
      goal: String(fd.get("goal") ?? ""),
      feeling: brief?.feeling ?? "",
      shots: shots.filter((x) => x.text.trim() || x.ref?.trim()).map((x) => ({ text: x.text.trim(), ref: x.ref?.trim() ? fixUrl(x.ref.trim()) : "", feeling: x.feeling?.trim() ?? "", done: x.done ?? false })),
      equipment: lines(fd.get("equipment")).map((l): Equipment => {
        const [text, ...who] = l.split(" - ");
        const prev = brief?.equipment.find((e) => e.text === text.trim());
        return { text: text.trim(), who: who.join(" - ").trim(), done: prev?.done ?? false };
      }),
      wardrobe: String(fd.get("wardrobe") ?? ""),
      schedule: String(fd.get("schedule") ?? ""),
      participants: String(fd.get("participants") ?? ""),
      links: brief?.links ?? "",
    }));
  }

  return (
    <form ref={form} className="stack brief-form" onSubmit={(e) => { e.preventDefault(); save("final"); }}>
      <div className="brief-top">
        <Link className="tbtn" href={brief?.id ? `/c/${clientId}/briefs/${brief.id}` : `/c/${clientId}/inspiration`}>ביטול</Link>
        <button type="button" className="tbtn" onClick={() => save("draft")} disabled={pending}>שמירה כטיוטה</button>
      </div>

      <label className="field"><span className="label">כותרת</span><input name="title" defaultValue={brief?.title} /></label>
      <div className="brief-when">
        <label className="field"><span className="label">תאריך</span><input type="date" name="shoot_date" defaultValue={brief?.shoot_date ?? ""} /></label>
        <label className="field"><span className="label">משעה</span><input type="time" name="from" defaultValue={/^\d{1,2}:\d{2}$/.test(from) ? from.padStart(5, "0") : ""} /></label>
        <label className="field"><span className="label">עד</span><input type="time" name="to" defaultValue={/^\d{1,2}:\d{2}$/.test(to) ? to.padStart(5, "0") : ""} /></label>
      </div>
      <label className="field"><span className="label">לוקיישן</span><input name="location" defaultValue={brief?.location} /></label>
      <label className="field"><span className="label">לוח השראה (Vision board)</span>
        <input name="vision_board" dir="auto" inputMode="url" defaultValue={brief?.vision_board} aria-label="קישור ללוח השראה" />
      </label>
      <label className="field"><span className="label">הרעיון המרכזי / מטרה</span><textarea name="goal" rows={3} defaultValue={brief?.goal} /></label>

      {/* רשימת הצילומים */}
      <div className="field">
        <span className="label">מה מצלמים</span>
        <div className="shotlist">
          {shots.map((x, i) => (
            <div key={i} className="shot">
              <span className="shot-n num">{i + 1}</span>
              <div className="shot-body">
                <input value={x.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="תיאור הסרטון / התמונה" aria-label={`צילום ${i + 1} – תיאור`} />
                <div className="shot-ref">
                  <input value={x.ref ?? ""} onChange={(e) => set(i, { ref: e.target.value })} dir="auto" className="ref-input" inputMode="url" placeholder="קישור להשראה" aria-label={`צילום ${i + 1} – קישור להשראה`} />
                  {x.ref && isUrl(x.ref) && <a className="shot-open" href={fixUrl(x.ref.trim())} target="_blank" rel="noopener">צפייה ↗</a>}
                </div>
                <input value={x.feeling ?? ""} onChange={(e) => set(i, { feeling: e.target.value })} placeholder="תחושה / ערכים שצריכים לצאת" aria-label={`צילום ${i + 1} – תחושה`} />
              </div>
              <button type="button" className="xbtn" aria-label={`הסרת צילום ${i + 1}`} onClick={() => setShots((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : [{ text: "" }]))}>×</button>
            </div>
          ))}
          <button type="button" className="shot-add" onClick={() => setShots((s) => [...s, { text: "" }])}>+ צילום נוסף</button>
        </div>
      </div>

      <label className="field"><span className="label">ציוד (שורה לכל פריט, ומי מביא אחרי מקף)</span><textarea name="equipment" rows={4} defaultValue={equipText} /></label>
      <label className="field"><span className="label">לבוש</span><input name="wardrobe" defaultValue={brief?.wardrobe} /></label>
      <label className="field"><span className="label">לוחות זמנים</span><textarea name="schedule" rows={3} defaultValue={brief?.schedule} /></label>
      <label className="field"><span className="label">מי מגיע</span><input name="participants" defaultValue={brief?.participants} /></label>
      <div className="acts2">
        <button type="button" className="tbtn" onClick={() => save("draft")} disabled={pending}>שמירה כטיוטה</button>
        <button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירת הבריף"}</button>
      </div>
    </form>
  );
}
