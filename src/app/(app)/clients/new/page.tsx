import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { createClientAction } from "../../admin-actions";
import { INDUSTRY_LABEL } from "@/lib/holidays";

export const metadata = { title: "לקוח חדש · BLOOMS" };

export default async function NewClientPage() {
  const ctx = await getContext();
  if (ctx.role !== "owner") notFound();
  return (
    <form action={createClientAction} className="sec">
      <h1 className="page-title">לקוח חדש</h1>
      <div className="card stack">
        <label className="field"><span className="label">שם העסק</span><input name="name" required /></label>
        <label className="field"><span className="label">שם משתמש באינסטגרם</span><input name="handle" dir="ltr" placeholder="lapizzale_bar" /></label>
        <fieldset className="field">
          <legend className="label">תחום · קובע אילו ימים מיוחדים יופיעו בלוח</legend>
          <div className="seg">
            {Object.entries(INDUSTRY_LABEL).map(([k, l]) => (
              <label key={k} className="radio"><input type="radio" name="industry" value={k} defaultChecked={k === "other"} /><span>{l}</span></label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend className="label">מנהל/ת לקוח · אחראי/ת גם על ההעלאות</legend>
          <div className="seg">
            {ctx.team.map((t) => (
              <label key={t.id} className="radio">
                <input type="radio" name="manager" value={t.id} defaultChecked={t.id === ctx.userId} />
                <span>{t.full_name || "ללא שם"}{t.id === ctx.userId ? " (את)" : ""}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="txt">את משתמשי הלקוח מזמינים בעמוד הבא, בתיק הלקוח.</p>
      <button className="pbtn">יצירת לקוח</button>
    </form>
  );
}
