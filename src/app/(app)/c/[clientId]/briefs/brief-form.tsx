"use client";

import { useTransition } from "react";
import { saveBrief, type BriefInput, type Equipment } from "./actions";

const lines = (s: FormDataEntryValue | null) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

// טופס בריף. סרטונים – שורה לכל סרטון; ציוד – שורה לכל פריט, ואחרי מקף מי מביא ("פיט אש - הדס")
export function BriefForm({ clientId, brief }: { clientId: string; brief?: BriefInput }) {
  const [pending, start] = useTransition();
  const equipText = (brief?.equipment ?? []).map((e) => (e.who ? `${e.text} - ${e.who}` : e.text)).join("\n");
  return (
    <form className="stack brief-form" action={(fd) => start(() => saveBrief({
      id: brief?.id, client_id: clientId,
      title: String(fd.get("title") ?? ""),
      shoot_date: String(fd.get("shoot_date") ?? "") || null,
      time_text: String(fd.get("time_text") ?? ""),
      location: String(fd.get("location") ?? ""),
      goal: String(fd.get("goal") ?? ""),
      feeling: String(fd.get("feeling") ?? ""),
      shots: lines(fd.get("shots")).map((text) => ({ text })),
      equipment: lines(fd.get("equipment")).map((l): Equipment => {
        const [text, ...who] = l.split(" - ");
        const prev = brief?.equipment.find((e) => e.text === text.trim());
        return { text: text.trim(), who: who.join(" - ").trim(), done: prev?.done ?? false };
      }),
      wardrobe: String(fd.get("wardrobe") ?? ""),
      schedule: String(fd.get("schedule") ?? ""),
      participants: String(fd.get("participants") ?? ""),
      links: String(fd.get("links") ?? ""),
    }))}>
      <label className="field"><span className="label">כותרת</span><input name="title" defaultValue={brief?.title} placeholder="בריף צילומים – הרמת כוסית לראש השנה" required /></label>
      <div className="three">
        <label className="field"><span className="label">תאריך</span><input type="date" name="shoot_date" defaultValue={brief?.shoot_date ?? ""} /></label>
        <label className="field"><span className="label">שעות</span><input name="time_text" defaultValue={brief?.time_text} placeholder="14:30–19:00" /></label>
        <label className="field"><span className="label">לוקיישן</span><input name="location" defaultValue={brief?.location} placeholder="צריך להחליט" /></label>
      </div>
      <label className="field"><span className="label">הרעיון המרכזי / מטרה</span><textarea name="goal" rows={4} defaultValue={brief?.goal} /></label>
      <label className="field"><span className="label">התחושה הרצויה</span><input name="feeling" defaultValue={brief?.feeling} placeholder="מקצועיות, מקומיות, ניקיון" /></label>
      <label className="field"><span className="label">סרטונים ותמונות (שורה לכל אחד)</span><textarea name="shots" rows={6} defaultValue={(brief?.shots ?? []).map((s) => s.text).join("\n")} placeholder={"סרטון – מתכון פילה פורל על ריזוטו\nקרוסלה – כולם מרימים לחיים"} /></label>
      <label className="field"><span className="label">ציוד (שורה לכל פריט, ומי מביא אחרי מקף)</span><textarea name="equipment" rows={8} defaultValue={equipText} placeholder={"פיט אש - הדס ויולי\nסיר לבישול על אש - תומר"} /></label>
      <label className="field"><span className="label">לבוש</span><input name="wardrobe" defaultValue={brief?.wardrobe} placeholder="חקלאי, בדים טבעיים, בלי הדפסים" /></label>
      <label className="field"><span className="label">לוחות זמנים</span><textarea name="schedule" rows={4} defaultValue={brief?.schedule} /></label>
      <label className="field"><span className="label">מי מגיע</span><input name="participants" defaultValue={brief?.participants} /></label>
      <label className="field"><span className="label">השראות וקישורים</span><textarea name="links" rows={3} defaultValue={brief?.links} dir="auto" /></label>
      <div className="acts2"><span /><button className="pbtn" disabled={pending}>{pending ? "שומרים…" : "שמירת הבריף"}</button></div>
    </form>
  );
}
