"use client";

import { useEffect } from "react";

// חלונית תחתונה אחידה; נסגרת בלחיצה על הרקע או ב-Escape
export function Sheet({ onClose, label, children, busy }: { onClose: () => void; label: string; children: React.ReactNode; busy?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}
