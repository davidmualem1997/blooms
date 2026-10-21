"use client";

import { Capacitor } from "@capacitor/core";

// האם אנחנו בתוך אפליקציית האייפון (ולא בדפדפן)
export const isNativeApp = () => Capacitor.isNativePlatform();

// הכתובת הפרטית שאליה Google מחזיר את האפליקציה אחרי ההתחברות
export const NATIVE_AUTH_REDIRECT = "blooms://auth/callback";
