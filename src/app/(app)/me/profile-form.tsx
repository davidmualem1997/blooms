"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { makeThumb } from "@/lib/media-client";
import { Avatar } from "@/components/avatar";
import { updateProfile } from "./actions";

export function ProfileForm({ userId, name, email, avatar, roleLabel }: { userId: string; name: string; email: string; avatar: string | null; roleLabel: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState(avatar);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  async function onFile(f?: File) {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    const blob = (await makeThumb(f)) ?? f;
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) return setMsg("לא הצלחנו להעלות את התמונה");
    start(async () => { await updateProfile({ avatar_path: path }); setMsg("התמונה עודכנה"); });
  }

  return (
    <div className="card stack">
      <label className="avatar-pick">
        <Avatar src={preview} name={name} size={96} />
        <span className="edit">החלפת תמונה</span>
        <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <form className="stack" action={(fd) => start(async () => { await updateProfile({ full_name: String(fd.get("name") ?? "").trim() }); setMsg("נשמר"); })}>
        <label className="field"><span className="label">שם</span><input name="name" defaultValue={name} /></label>
        <div className="txt" dir="ltr" style={{ textAlign: "right" }}>{email}</div>
        <div className="rolebadge">{roleLabel}</div>
        <button className="pbtn" disabled={pending}>שמירה</button>
      </form>
      {msg && <p className="txt">{msg}</p>}
      <button className="tbtn danger" onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}>התנתקות</button>
    </div>
  );
}
