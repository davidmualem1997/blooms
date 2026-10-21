"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PushNotifications } from "@capacitor/push-notifications";
import { nativePushState, registerNativePush } from "@/lib/native-push";
import { isNativeApp } from "@/lib/native";

// חיבורים שקיימים רק באפליקציית האייפון. בדפדפן הרכיב לא עושה כלום.
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("native");

    // חזרה מההתחברות עם Google: blooms://auth/callback?code=... → מחליפים את הקוד בסשן באתר עצמו
    const sub = App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith("blooms://auth/callback")) return;
      await Browser.close().catch(() => {});
      const query = url.slice(url.indexOf("?"));
      // ניווט מלא בכוונה: נקודת הקצה של השרת שומרת את העוגיות ומפנה הלאה
      window.location.assign(new URL(`/auth/callback${query.startsWith("?") ? query : ""}`, window.location.origin).href);
    });

    // התראות של אפל: אם כבר אושרו – מרעננים את הרישום (ה-token יכול להשתנות). לחיצה על התראה פותחת את המסך שלה
    if (!location.pathname.startsWith("/login")) nativePushState().then((st) => { if (st === "granted") void registerNativePush(); }).catch(() => {});
    const tap = PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      if (url?.startsWith("/")) window.location.assign(new URL(url, window.location.origin).href);
    });

    // שורת הסטטוס (שעון, סוללה) בצבע שמתאים למצב בהיר/כהה
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = () => StatusBar.setStyle({ style: dark.matches ? Style.Dark : Style.Light }).catch(() => {});
    paint();
    dark.addEventListener("change", paint);

    return () => { sub.then((s) => s.remove()); tap.then((t) => t.remove()); dark.removeEventListener("change", paint); };
  }, []);
  return null;
}
