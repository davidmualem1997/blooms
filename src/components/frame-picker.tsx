"use client";

import { useRef, useState } from "react";

// בחירת קאבר מתוך הסרטון: גוללים בטיימליין, והפריים שנבחר נשמר כתמונה
export function FramePicker({ src, onPick, onCancel }: { src: string; onPick: (file: File) => Promise<void>; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [t, setT] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seek = (v: number) => {
    setT(v);
    if (video.current) video.current.currentTime = v;
  };

  async function pick() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    setError("");
    try {
      // ברזולוציה מלאה עד 1440 ברוחב – מספיק לקאבר בלי קובץ ענק
      const scale = Math.min(1, 1440 / v.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("no frame");
      await onPick(new File([blob], "cover.jpg", { type: "image/jpeg" }));
    } catch {
      setError("לא הצלחנו לשמור את הפריים. נסו שוב או העלו תמונה.");
    } finally {
      setBusy(false);
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="frame-pick" data-no-drag>
      <video ref={video} src={src} crossOrigin="anonymous" muted playsInline preload="auto"
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); seek(Math.min(0.5, (e.currentTarget.duration || 0) / 2)); }}
        onLoadedData={async (e) => { try { await e.currentTarget.play(); e.currentTarget.pause(); } catch { /* אייפון צריך "להעיר" את הסרטון */ } }} />
      <input type="range" dir="ltr" min={0} max={duration || 0} step={0.04} value={t} disabled={!duration}
        onChange={(e) => seek(Number(e.target.value))} aria-label="מיקום בסרטון" />
      <div className="acts2">
        <span className="txt num">{duration ? `${fmt(t)} / ${fmt(duration)}` : "טוענים את הסרטון…"}</span>
        <span className="row-gap">
          <button type="button" className="tbtn" onClick={onCancel} disabled={busy}>ביטול</button>
          <button type="button" className="pbtn small" onClick={pick} disabled={busy || !duration}>{busy ? "שומרים…" : "זה הקאבר"}</button>
        </span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
