import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// הצפנת ההרשאות (tokens) של החיבורים: AES-256-GCM.
// המפתח רק בשרת – INTEGRATIONS_KEY (32 בתים ב-base64: openssl rand -base64 32)
function key() {
  const k = Buffer.from(process.env.INTEGRATIONS_KEY?.trim() ?? "", "base64");
  if (k.length !== 32) throw new Error("INTEGRATIONS_KEY is missing or not 32 bytes (base64)");
  return k;
}

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret<T>(payload: string): T {
  const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
}
