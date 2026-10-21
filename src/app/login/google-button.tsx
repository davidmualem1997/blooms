"use client";

import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { createClient } from "@/lib/supabase/client";
import { NATIVE_AUTH_REDIRECT, isNativeApp } from "@/lib/native";

export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setBusy(true);
    setError("");
    // באפליקציה: Google חוסם התחברות בתוך דפדפן מוטמע, לכן פותחים את החלון המאובטח של אפל
    // ומקבלים את המשתמש חזרה דרך blooms://auth/callback (ראו NativeBridge)
    if (isNativeApp()) {
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (!error && data.url) { await Browser.open({ url: data.url, presentationStyle: "popover" }); setBusy(false); return; }
      setError("לא הצלחנו להתחבר ל-Google. נסו שוב.");
      setBusy(false);
      return;
    }
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
