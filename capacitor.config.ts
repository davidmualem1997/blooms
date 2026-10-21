import type { CapacitorConfig } from "@capacitor/cli";

// האפליקציה לאייפון: מעטפת native שטוענת את BLOOMS מהשרת.
// כל שינוי שנדחף לאתר מופיע מיד גם באפליקציה – בלי גרסה חדשה בחנות.
// לפיתוח מול המחשב: CAP_SERVER_URL=http://<IP של המק>:3000 npx cap sync ios
const serverUrl = process.env.CAP_SERVER_URL || "https://blooms-phi.vercel.app";

const config: CapacitorConfig = {
  appId: "com.youlilu.blooms",
  appName: "BLOOMS",
  webDir: "native-shell",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    // ניווט לדומיינים האלה נשאר בתוך האפליקציה; כל השאר נפתח בספארי
    allowNavigation: ["blooms-phi.vercel.app", "*.supabase.co"],
  },
  ios: {
    contentInset: "never", // ה-CSS כבר מטפל באזורים הבטוחים (notch, פס הבית)
    backgroundColor: "#f5f5f7",
    scheme: "BLOOMS",
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#f5f5f7", showSpinner: false },
    StatusBar: { overlaysWebView: true, style: "DEFAULT" },
  },
};

export default config;
