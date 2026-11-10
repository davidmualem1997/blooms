import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { NativeBridge } from "@/components/native-bridge";

const heebo = Heebo({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-heebo" });

export const metadata: Metadata = {
  title: "BLOOMS",
  description: "ניהול הסושיאל של הסטודיו: גאנט, פיד, השראה ותיק לקוח.",
  applicationName: "BLOOMS",
  appleWebApp: { capable: true, title: "BLOOMS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // בלי זום אוטומטי כשנוגעים בשדה (הגדלה בשתי אצבעות עדיין עובדת באייפון)
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <NativeBridge />
        {children}
      </body>
    </html>
  );
}
