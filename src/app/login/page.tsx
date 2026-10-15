import { GoogleButton } from "./google-button";

export const metadata = { title: "כניסה · BLOOMS" };

// מסך פתיחה בסגנון iOS: המותג במרכז, הפעולה למטה בהישג האגודל
export default function LoginPage() {
  return (
    <main className="welcome">
      <div className="welcome-mark">
        <span className="app-icon" aria-hidden="true"><i /><i /><i /><i /></span>
        <h1 dir="ltr">BLOOMS</h1>
        <p>ניהול הסושיאל של הסטודיו,<br />במקום אחד.</p>
      </div>
      <div className="welcome-actions">
        <GoogleButton />
        <span className="txt">בכניסה את/ה מסכימ/ה ל<a className="edit" href="/privacy">מדיניות הפרטיות</a></span>
      </div>
    </main>
  );
}
