"use client";

import { useState, useTransition } from "react";
import { updateBrand } from "@/app/(app)/c/[clientId]/file/actions";
import { uploadMedia } from "@/lib/media-client";

function useBrandUpload(clientId: string, studioId: string, key: "cover_path" | "logo_path") {
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  async function upload(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const entry = await uploadMedia(f, studioId, clientId, () => {});
      start(() => updateBrand(clientId, { [key]: entry.path }));
    } finally {
      setBusy(false);
    }
  }
  return { busy, upload };
}

// החלפת קאבר – רק לצוות (מנהלת הסטודיו ומנהל/ת הלקוח); נאכף גם במסד הנתונים
export function CoverEdit({ clientId, studioId }: { clientId: string; studioId: string }) {
  const { busy, upload } = useBrandUpload(clientId, studioId, "cover_path");
  return (
    <label className="hero-btn cover-btn">
      {busy ? "מעלים…" : "החלפת קאבר"}
      <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </label>
  );
}

export function LogoEdit({ clientId, studioId }: { clientId: string; studioId: string }) {
  const { busy, upload } = useBrandUpload(clientId, studioId, "logo_path");
  return (
    <label className="hero-btn logo-btn" aria-label="החלפת לוגו">
      {busy ? "…" : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
      )}
      <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </label>
  );
}
