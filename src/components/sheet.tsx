"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// חלונית תחתונה אחידה, כמו ב-iOS:
// • החלקה למטה סוגרת – החלונית עוקבת אחרי האצבע, ונסגרת אם משכו מספיק או "זרקו" מהר
// • כפתור × קבוע למעלה, לחיצה על הרקע ו-Escape
// • בזמן שמירה (busy) אי אפשר לסגור, כדי לא לאבד שינויים באמצע
export function Sheet({ onClose, label, children, busy, role = "dialog" }: {
  onClose: () => void; label: string; children: React.ReactNode; busy?: boolean; role?: "dialog" | "alertdialog";
}) {
  // נפתחת ישירות ב-body: אלמנט עם backdrop-filter (השורה העליונה) "לוכד" חלונות fixed שבתוכו
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const busyRef = useRef(busy);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  // יציאה: מחליקים למטה מהמיקום הנוכחי ואז סוגרים
  const close = useCallback(() => {
    if (busyRef.current || leaving) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { onClose(); return; }
    setLeaving(true);
    const el = sheetRef.current, scrim = scrimRef.current;
    if (el) { el.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)"; el.style.transform = "translateY(100%)"; }
    if (scrim) { scrim.style.transition = "opacity 0.28s ease"; scrim.style.opacity = "0"; }
    window.setTimeout(onClose, 260);
  }, [onClose, leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // גרירה למטה: רק כשהתוכן בראש הגלילה, וכשמתחילים לנוע למטה – כך גלילה רגילה בתוך החלונית לא נפגעת
  useEffect(() => {
    const el = sheetRef.current, scrim = scrimRef.current;
    if (!el) return;
    let startY = 0, dy = 0, dragging = false, eligible = false;
    let samples: { y: number; t: number }[] = [];

    const begin = (y: number, target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      eligible = !busyRef.current && el.scrollTop <= 0 && !t?.closest("textarea, input[type=range], select, [data-no-drag], .media-strip, .story-strip, .feed");
      startY = y; dy = 0; dragging = false; samples = [{ y, t: performance.now() }];
    };
    const move = (y: number, e: Event) => {
      if (!eligible) return;
      const d = y - startY;
      if (!dragging) {
        if (d > 6 && el.scrollTop <= 0) { dragging = true; el.style.transition = "none"; if (scrim) scrim.style.transition = "none"; }
        else if (d < -6) { eligible = false; return; } // גלילה למעלה – לא גרירה
        else return;
      }
      e.preventDefault();
      dy = Math.max(0, d);
      el.style.transform = `translateY(${dy}px)`;
      if (scrim) scrim.style.opacity = String(Math.max(0.2, 1 - dy / (el.offsetHeight * 1.2)));
      samples.push({ y, t: performance.now() });
      if (samples.length > 6) samples.shift();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const a = samples[0], b = samples[samples.length - 1];
      const v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px/ms
      const projected = dy + v * 499; // הקרנת תנופה כמו ב-iOS (decelerationRate 0.998)
      if (projected > el.offsetHeight * 0.45 || v > 0.9) { close(); return; }
      el.style.transition = "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateY(0)";
      if (scrim) { scrim.style.transition = "opacity 0.3s ease"; scrim.style.opacity = "1"; }
    };

    const ts = (e: TouchEvent) => begin(e.touches[0].clientY, e.target);
    const tm = (e: TouchEvent) => move(e.touches[0].clientY, e);
    const pd = (e: PointerEvent) => { if (e.pointerType === "mouse" && (e.target as HTMLElement).closest(".sheet-top")) { begin(e.clientY, e.target); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } };
    const pm = (e: PointerEvent) => { if (e.pointerType === "mouse" && eligible) move(e.clientY, e); };
    const pu = (e: PointerEvent) => { if (e.pointerType === "mouse") { end(); eligible = false; } };

    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointermove", pm);
    el.addEventListener("pointerup", pu);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointermove", pm);
      el.removeEventListener("pointerup", pu);
    };
  }, [close, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div ref={scrimRef} className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={sheetRef} className="sheet" role={role} aria-modal="true" aria-label={label}>
        <div className="sheet-top">
          <div className="grab" aria-hidden="true" />
          <button type="button" className="sheet-x" onClick={close} disabled={busy} aria-label="סגירה">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
