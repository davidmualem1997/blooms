"use client";

import { useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { uploadMedia } from "@/lib/media-client";
import type { ExtractedBrand } from "@/lib/brand-extract";
import type { Brand } from "@/lib/types";
import { updateBrand } from "./actions";
import { readClientPdf } from "./pdf-actions";
import { readClientSite } from "./site-actions";

type Key = keyof ExtractedBrand;
const FIELDS: { k: Key; l: string }[] = [
  { k: "story", l: "סיפור העסק" }, { k: "values", l: "ערכים" }, { k: "audience", l: "קהל יעד" }, { k: "tone", l: "טון ושפה" },
  { k: "dos", l: "מה כן" }, { k: "donts", l: "מה לא" }, { k: "examples", l: "דוגמאות" }, { k: "recurring", l: "תכנים קבועים" },
  { k: "palette", l: "צבעי המותג" }, { k: "fonts", l: "פונטים" }, { k: "socials", l: "רשתות ואתר" }, { k: "booking", l: "הזמנות, תפריט וניווט" },
  { k: "hours", l: "שעות פתיחה" }, { k: "ops", l: "מידע תפעולי" }, { k: "contacts", l: "אנשי קשר" }, { k: "faq", l: "שאלות נפוצות" },
  { k: "industry", l: "תחום" },
];
const INDUSTRY: Record<string, string> = { food: "אוכל ומסעדות", retail: "חנות", beauty: "יופי וטיפוח", fashion: "אופנה", fitness: "כושר", other: "אחר" };

const hasValue = (v: unknown) => Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.values(v).some(Boolean) : Boolean(v);

// תצוגה קצרה של מה שנמצא
function preview(k: Key, v: ExtractedBrand[Key]): React.ReactNode {
  if (k === "palette") return <span className="pal-mini">{(v as ExtractedBrand["palette"]).map((c) => <i key={c.hex} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />)}</span>;
  if (k === "contacts") return (v as ExtractedBrand["contacts"]).map((c) => [c.name, c.role, c.phone].filter(Boolean).join(" · ")).join("\n");
  if (k === "faq") return `${(v as ExtractedBrand["faq"]).length} שאלות ותשובות`;
  if (k === "industry") return INDUSTRY[v as string] ?? "";
  if (typeof v === "object") return Object.values(v as Record<string, string>).filter(Boolean).join("\n");
  return v as string;
}

// "מילוי מ-PDF": מעלים מסמך של הלקוח, ה-AI מחלץ את המידע, ומאשרים מה להכניס לתיק
export function PdfImport({ clientId, studioId, brand }: { clientId: string; studioId: string; brand: Brand }) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "upload" | "read">("idle");
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<ExtractedBrand | null>(null);
  const [error, setError] = useState("");

  async function onFile(f?: File) {
    if (!f) return;
    setError("");
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setError("צריך קובץ PDF");
    try {
      setStage("upload");
      const pdf = new File([f], "original.pdf", { type: "application/pdf" });
      const { path } = await uploadMedia(pdf, studioId, clientId, setProgress);
      setStage("read");
      const res = await readClientPdf(clientId, path);
      setStage("idle");
      if (res.error || !res.data) return setError(res.error ?? "משהו השתבש");
      if (!FIELDS.some((x) => hasValue(res.data![x.k]))) return setError("לא מצאנו בקובץ מידע לתיק הלקוח");
      setFound(res.data);
    } catch {
      setStage("idle");
      setError("ההעלאה נכשלה. נסו שוב.");
    }
  }

  const busy = stage !== "idle";
  return (
    <>
      <button type="button" className="pdf-btn" onClick={() => input.current?.click()} disabled={busy}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3.5h8l4.5 4.5v12.5H6z" /><path d="M14 3.5V8h4.5" /><path d="M9.5 13.5l2.5 2.5 2.5-2.5M12 10.5V16" />
        </svg>
        <span className="pdf-body">
          <b className="w500">{stage === "upload" ? `מעלים… ${Math.round(progress * 100)}%` : stage === "read" ? "קוראים את הקובץ…" : "מילוי אוטומטי מ-PDF"}</b>
          <span className="txt">{stage === "read" ? "זה לוקח בערך חצי דקה" : "מעלים תיק מותג או אפיון – והתיק מתמלא לבד"}</span>
        </span>
        {busy && <span className="spinner" aria-hidden="true" />}
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className="error">{error}</p>}
      {found && <ImportReview clientId={clientId} brand={brand} found={found} from="בקובץ" onClose={() => setFound(null)} />}
    </>
  );
}

// "מילוי מהאתר": כתובת האתר של העסק → צבעים, לוגו, פונטים, רשתות, שעות וסיפור העסק
export function SiteImport({ clientId, brand }: { clientId: string; brand: Brand }) {
  const [url, setUrl] = useState(brand.socials?.website ?? "");
  const [found, setFound] = useState<{ data: ExtractedBrand; logo?: { path: string; src: string } } | null>(null);
  const [error, setError] = useState("");
  const [reading, start] = useTransition();

  const read = () => start(async () => {
    setError("");
    const res = await readClientSite(clientId, url);
    if (res.error || !res.data) return setError(res.error ?? "משהו השתבש");
    if (!res.logo && !FIELDS.some((x) => hasValue(res.data![x.k]))) return setError("לא מצאנו באתר מידע לתיק הלקוח");
    setFound({ data: res.data, logo: res.logo });
  });

  return (
    <>
      <form className="pdf-btn site-imp" onSubmit={(e) => { e.preventDefault(); read(); }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z" />
        </svg>
        <span className="pdf-body">
          <b className="w500">{reading ? "סורקים את האתר…" : "מילוי אוטומטי מהאתר"}</b>
          {reading ? <span className="txt">זה לוקח בערך חצי דקה</span> : (
            <span className="site-row">
              <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" inputMode="url" placeholder="www.example.co.il" aria-label="כתובת האתר" />
              <button className="pbtn small" disabled={!url.trim()}>סריקה</button>
            </span>
          )}
        </span>
        {reading && <span className="spinner" aria-hidden="true" />}
      </form>
      {error && <p className="error">{error}</p>}
      {found && <ImportReview clientId={clientId} brand={brand} found={found.data} logo={found.logo} from="באתר" onClose={() => setFound(null)} />}
    </>
  );
}

// מה נמצא: מסמנים מה להכניס לתיק. שדות שכבר מלאים לא מסומנים מראש
function ImportReview({ clientId, brand, found, logo, from, onClose }: {
  clientId: string; brand: Brand; found: ExtractedBrand; logo?: { path: string; src: string }; from: string; onClose: () => void;
}) {
  const keys = FIELDS.map((x) => x.k).filter((k) => hasValue(found[k]));
  const [picked, setPicked] = useState<Set<Key>>(() => new Set(keys.filter((k) => !hasValue(brand[k as keyof Brand]))));
  const [useLogo, setUseLogo] = useState(Boolean(logo && !brand.logo_path));
  const [saving, start] = useTransition();

  function apply() {
    const patch: Partial<Brand> = {};
    if (logo && useLogo) patch.logo_path = logo.path;
    for (const k of picked) {
      const v = found[k];
      if (k === "socials" || k === "booking") {
        const add = Object.fromEntries(Object.entries(v as Record<string, string>).filter(([, x]) => x));
        (patch as Record<string, unknown>)[k] = { ...(brand[k] ?? {}), ...add };
      } else if (k === "contacts" || k === "palette" || k === "faq") {
        // רשימות: מוסיפים מה שעוד אין
        const cur = (brand[k] ?? []) as Record<string, string>[];
        const id = (x: Record<string, string>) => (x.hex ?? x.q ?? x.phone ?? x.name ?? "").toLowerCase();
        (patch as Record<string, unknown>)[k] = [...cur, ...(v as Record<string, string>[]).filter((x) => !cur.some((c) => id(c) === id(x)))];
      } else {
        (patch as Record<string, unknown>)[k] = v;
      }
    }
    start(async () => { await updateBrand(clientId, patch); onClose(); });
  }

  const toggle = (k: Key) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const count = picked.size + (logo && useLogo ? 1 : 0);

  return (
    <Sheet onClose={onClose} label={`מה מצאנו ${from}`} busy={saving}>
      <h2>מה מצאנו {from}</h2>
      <span className="txt">מסמנים מה להכניס לתיק. שדות שכבר יש בהם תוכן לא מסומנים – כדי לא לדרוס אותם בטעות. סיסמאות ופרטי התחברות לא נשמרים.</span>
      <div className="note">
        {logo && (
          <label className="pdf-row">
            <input type="checkbox" checked={useLogo} onChange={() => setUseLogo((x) => !x)} />
            <span className="pdf-field">
              <b className="w500">לוגו {brand.logo_path && <span className="tag">יחליף את הקיים</span>}</b>
              {/* eslint-disable-next-line @next/next/no-img-element -- קישור חתום זמני */}
              <img className="imp-logo" src={logo.src} alt="הלוגו שנמצא" />
            </span>
          </label>
        )}
        {FIELDS.filter((x) => hasValue(found[x.k])).map((x) => {
          const filled = hasValue(brand[x.k as keyof Brand]);
          return (
            <label key={x.k} className="pdf-row">
              <input type="checkbox" checked={picked.has(x.k)} onChange={() => toggle(x.k)} />
              <span className="pdf-field">
                <b className="w500">{x.l} {filled && <span className="tag">{["contacts", "palette", "faq"].includes(x.k) ? "יתווספו לקיים" : "יחליף את הקיים"}</span>}</b>
                <span className="pdf-val">{preview(x.k, found[x.k])}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="acts2">
        <span className="txt">{count} שדות נבחרו</span>
        <button className="pbtn" onClick={apply} disabled={saving || !count}>{saving ? "שומרים…" : "הכנסה לתיק"}</button>
      </div>
    </Sheet>
  );
}
