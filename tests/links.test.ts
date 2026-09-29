// npx tsx tests/links.test.ts
import { normalizeTarget } from "@/lib/links";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
ok(normalizeTarget("phone", "050-123-4567") === "tel:+972501234567", "israeli phone → tel:+972");
ok(normalizeTarget("whatsapp", "050 1234567") === "https://wa.me/972501234567", "whatsapp number → wa.me");
ok(normalizeTarget("menu", "lpizzale.co.il/menu") === "https://lpizzale.co.il/menu", "adds https://");
ok(normalizeTarget("site", "javascript:alert(1)") === null, "rejects javascript:");
ok(normalizeTarget("site", "just words") === null, "rejects non-url");
ok(normalizeTarget("reservation", "https://ontopo.com/he/il/page/לפיצהלה")?.startsWith("https://ontopo.com/he/il/page/%D7") === true, "encodes hebrew so the DB check passes");
