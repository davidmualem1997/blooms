import "server-only";
import { connect, type ClientHttp2Session } from "node:http2";
import { sign } from "node:crypto";

// שליחת התראות ישירות לשרתי אפל (APNs), בלי שירות ביניים.
// מפתחות מחשבון המפתחים של אפל: APNS_KEY (תוכן קובץ ה-.p8, אפשר ב-base64), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
export type ApnsEnv = keyof typeof HOSTS;

export const apnsConfigured = () => Boolean(process.env.APNS_KEY?.trim() && process.env.APNS_KEY_ID?.trim() && process.env.APNS_TEAM_ID?.trim());

function privateKey() {
  const raw = process.env.APNS_KEY!.trim();
  return raw.includes("BEGIN PRIVATE KEY") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
}

// JWT לאפל – תקף שעה, נוצר מחדש כל 50 דקות
let cached: { jwt: string; at: number } | null = null;
function bearer() {
  if (cached && Date.now() - cached.at < 50 * 60e3) return cached.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "ES256", kid: process.env.APNS_KEY_ID!.trim() })}.${b64({ iss: process.env.APNS_TEAM_ID!.trim(), iat: Math.floor(Date.now() / 1000) })}`;
  const sig = sign("sha256", Buffer.from(head), { key: privateKey(), dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { jwt: `${head}.${sig}`, at: Date.now() };
  return cached.jwt;
}

export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string };

function send(session: ClientHttp2Session, token: string, body: string, collapse?: string): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const req = session.request({
      ":method": "POST", ":path": `/3/device/${token}`,
      authorization: `bearer ${bearer()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID?.trim() || "com.youlilu.blooms",
      "apns-push-type": "alert", "apns-priority": "10",
      ...(collapse ? { "apns-collapse-id": collapse.slice(0, 64) } : {}),
    });
    let status = 0, data = "";
    req.on("response", (h) => { status = Number(h[":status"]); });
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(status === 200 ? { ok: true } : { ok: false, status, reason: (() => { try { return JSON.parse(data).reason; } catch { return data; } })() }));
    req.on("error", (e) => resolve({ ok: false, status: 0, reason: e.message }));
    req.end(body);
  });
}

// שולח לכל ה-tokens; token שלא מתאים לסביבה (התקנה מ-Xcode מול TestFlight) מנוסה בסביבה השנייה
export async function sendApns(tokens: { token: string; env: ApnsEnv | null }[], payload: { title: string; body: string; url: string; tag?: string }) {
  const body = JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: "default", "thread-id": payload.tag ?? "blooms" }, url: payload.url });
  const sessions: Partial<Record<ApnsEnv, ClientHttp2Session>> = {};
  const session = (env: ApnsEnv) => (sessions[env] ??= connect(HOSTS[env]));
  const results: { token: string; env: ApnsEnv | null; ok: boolean; gone: boolean }[] = [];
  try {
    for (const t of tokens) {
      const order: ApnsEnv[] = t.env === "sandbox" ? ["sandbox", "production"] : ["production", "sandbox"];
      let done = false;
      for (const env of order) {
        const r = await send(session(env), t.token, body, payload.tag);
        if (r.ok) { results.push({ token: t.token, env, ok: true, gone: false }); done = true; break; }
        if (r.reason !== "BadDeviceToken") { results.push({ token: t.token, env: t.env, ok: false, gone: r.status === 410 || r.reason === "Unregistered" }); done = true; break; }
      }
      if (!done) results.push({ token: t.token, env: t.env, ok: false, gone: true });
    }
  } finally {
    for (const s of Object.values(sessions)) s?.close();
  }
  return results;
}
