"use client";

import { useEffect } from "react";

// הסרגל העליון כמו ב-iOS: גוללים למטה – הוא נגלל עם הדף ונעלם; גוללים למעלה – הוא חוזר וצף (מתחת לאי של האייפון)
export function HeaderAutoHide() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const delta = y - last;
      if (y < 60) root.classList.remove("hdr-hidden");             // בראש הדף – תמיד מוצג
      else if (delta > 6) root.classList.add("hdr-hidden");         // גלילה למטה
      else if (delta < -6) root.classList.remove("hdr-hidden");     // גלילה למעלה
      if (Math.abs(delta) > 6 || y < 60) last = y;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); root.classList.remove("hdr-hidden"); };
  }, []);
  return null;
}
