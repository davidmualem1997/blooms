"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { saveNativeToken } from "@/app/(app)/me/actions";

// התראות של אפל באפליקציית האייפון: הרשאה → רישום אצל אפל → token נשמר אצלנו
const KEY = "blooms-native-token";
export const storedNativeToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

let registering: Promise<string | null> | null = null;

export function registerNativePush(): Promise<string | null> {
  registering ??= new Promise((resolve) => {
    const done = (t: string | null) => { registering = null; resolve(t); };
    PushNotifications.addListener("registration", async ({ value }) => {
      try { localStorage.setItem(KEY, value); } catch {}
      await saveNativeToken(value);
      done(value);
    });
    PushNotifications.addListener("registrationError", () => done(null));
    PushNotifications.register().catch(() => done(null));
  });
  return registering;
}

export async function nativePushState(): Promise<"granted" | "denied" | "prompt"> {
  const p = await PushNotifications.checkPermissions();
  return p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
}

export async function enableNativePush(): Promise<"granted" | "denied" | "prompt"> {
  const p = await PushNotifications.requestPermissions();
  if (p.receive !== "granted") return p.receive === "denied" ? "denied" : "prompt";
  await registerNativePush();
  return "granted";
}
