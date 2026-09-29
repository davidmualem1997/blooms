"use client";

import { useEffect, useState, useTransition } from "react";
import { subscribePush, testPush, unsubscribePush } from "./actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

// הפעלת התראות למכשיר הזה. באייפון זה אפשרי רק כשהאפליקציה מותקנת במסך הבית
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      // מרעננים את הרישום בשרת (למשל אחרי התחברות בחשבון אחר באותו מכשיר)
      if (sub) await subscribePush(JSON.parse(JSON.stringify(sub)));
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () => start(async () => {
    setMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const res = await subscribePush(JSON.parse(JSON.stringify(sub)));
      if (res.error) return setMsg("לא הצלחנו להפעיל. נסו שוב.");
      setState("on");
      setMsg("ההתראות הופעלו במכשיר הזה");
    } catch {
      setMsg("לא הצלחנו להפעיל. נסו שוב.");
    }
  });

  const disable = () => start(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await unsubscribePush(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
    setMsg("");
  });

  const test = () => start(async () => {
    const { sent } = await testPush();
    setMsg(sent ? "נשלחה התראת בדיקה" : "ההתראה לא נשלחה. נסו לכבות ולהפעיל שוב.");
  });

  if (state === "loading") return null;

  return (
    <div className="card stack">
      <div className="label">התראות</div>
      {state === "ios-install" && (
        <p className="txt">כדי לקבל התראות באייפון: לוחצים על כפתור השיתוף בספארי ← &quot;הוספה למסך הבית&quot;, ופותחים את BLOOMS מהאייקון.</p>
      )}
      {state === "unsupported" && <p className="txt">הדפדפן הזה לא תומך בהתראות.</p>}
      {state === "denied" && <p className="txt">ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון ← התראות ← BLOOMS.</p>}
      {state === "off" && (
        <>
          <p className="txt">נעדכן כשלקוח שולח פנייה, כשתוכן מחכה לאישור, ותזכורת בכל בוקר על מה שעולה היום.</p>
          <button className="pbtn" onClick={enable} disabled={pending}>הפעלת התראות במכשיר הזה</button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="txt">ההתראות פעילות במכשיר הזה ✓</p>
          <span className="row-gap">
            <button className="tbtn" onClick={test} disabled={pending}>שליחת התראת בדיקה</button>
            <button className="tbtn" onClick={disable} disabled={pending}>כיבוי</button>
          </span>
        </>
      )}
      {msg && <p className="txt">{msg}</p>}
    </div>
  );
}
