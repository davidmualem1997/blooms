"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("לא הצלחנו להתחבר ל-Google. נסו שוב.");
      setBusy(false);
    }
  }

  return (
    <>
      <button className="pbtn wide" onClick={signIn} disabled={busy}>
        {busy ? "מתחברים…" : "כניסה עם Google"}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
