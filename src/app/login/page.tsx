import { GoogleButton } from "./google-button";

export const metadata = { title: "כניסה · BLOOMS" };

export default function LoginPage() {
  return (
    <main className="center-screen">
      <div className="login-card">
        <h1 className="display" dir="ltr">BLOOMS</h1>
        <p className="muted">ניהול הסושיאל של הסטודיו, במקום אחד.</p>
        <GoogleButton />
      </div>
    </main>
  );
}
