import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// סריקת אתר של עסק: דף הבית ועוד כמה דפים (אודות, צור קשר, תפריט).
// אוספים טקסט, צבעים, פונטים, קישורים ומועמדים ללוגו – ה-AI מסדר את זה לתיק הלקוח.
// מורידים רק כתובות ציבוריות (לא רשת פנימית), עם הגבלת זמן וגודל.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function privateIp(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("bad port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((x) => x.address);
  if (!ips.length || ips.some(privateIp)) throw new Error("private address");
}

// fetch עם בדיקה בכל הפניה (redirect) מחדש
export async function safeFetch(url: string, accept: string, maxBytes: number, timeout = 9000): Promise<{ res: Response; body: ArrayBuffer; url: string } | null> {
  let u = new URL(url);
  const signal = AbortSignal.timeout(timeout);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { signal, redirect: "manual", headers: { "user-agent": UA, accept, "accept-language": "he,en;q=0.8" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { u = new URL(res.headers.get("location")!, u); continue; }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const body = new Uint8Array(Math.min(size, maxBytes));
    let off = 0;
    for (const c of chunks) { body.set(c.subarray(0, body.length - off), off); off += c.byteLength; if (off >= body.length) break; }
    return { res, body: body.buffer, url: u.toString() };
  }
  return null;
}

async function getText(url: string, accept: string, max: number) {
  try {
    const r = await safeFetch(url, accept, max);
    return r ? { text: new TextDecoder().decode(r.body), url: r.url } : null;
  } catch { return null; }
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const attr = (tag: string, name: string) => decode(tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((x) => x !== undefined) ?? "");
const abs = (href: string, base: string) => { try { return new URL(href, base).toString(); } catch { return ""; } };

function visibleText(html: string) {
  return decode(html
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

function normHex(h: string) {
  let x = h.slice(1).toLowerCase();
  if (x.length === 3 || x.length === 4) x = x.slice(0, 3).split("").map((c) => c + c).join("");
  return x.length >= 6 ? "#" + x.slice(0, 6).toUpperCase() : "";
}
function countColors(css: string, into: Map<string, number>) {
  for (const m of css.matchAll(/#[0-9a-f]{3,8}\b/gi)) { const h = normHex(m[0]); if (h) into.set(h, (into.get(h) ?? 0) + 1); }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    const h = "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("").toUpperCase();
    into.set(h, (into.get(h) ?? 0) + 1);
  }
}

const PAGE_HINT = /about|story|contact|menu|hours|team|אודות|עלינו|הסיפור|צור.?קשר|תפריט|שעות|יצירת.?קשר/i;
const INTERESTING = /instagram\.com|tiktok\.com|facebook\.com|fb\.com|wa\.me|whatsapp|waze\.com|maps\.google|goo\.gl\/maps|maps\.app|g\.page|tabit|ontopo|restoplace|mishloha|wolt|10bis|cibus|calendly|youtube\.com|linkedin\.com|^tel:|^mailto:/i;

export type SiteScan = {
  url: string;
  title: string;
  description: string;
  themeColor: string;
  text: string;
  jsonLd: string;
  links: string[];
  colors: { hex: string; count: number }[];
  fonts: string[];
  logos: { url: string; why: string }[];
  logoColors: string[];
};

// צבעי ברירת מחדל של ספריות עיצוב (Bootstrap ודומיהן) – לא צבעי המותג
const FRAMEWORK = new Set(["#337AB7", "#5CB85C", "#5BC0DE", "#F0AD4E", "#D9534F", "#3C763D", "#8A6D3B", "#31708F", "#A94442", "#DFF0D8", "#FCF8E3", "#D9EDF7", "#F2DEDE",
  "#007BFF", "#28A745", "#17A2B8", "#FFC107", "#DC3545", "#6C757D", "#343A40", "#F8F9FA", "#0D6EFD", "#198754", "#0DCAF0", "#6610F2", "#6F42C1", "#D63384", "#FD7E14", "#20C997",
  "#23527C", "#286090", "#204D74", "#449D44", "#31B0D5", "#EC971F", "#C9302C", "#2E6DA4", "#4CAE4C", "#46B8DA", "#EEA236", "#D43F3A", "#0056B3", "#0A58CA"]);
const VENDOR_CSS = /bootstrap|vendor|plugin|awesome|jquery|slick|swiper|animate|normalize|reset|elementor-icons|dashicons|fancybox|owl\.|flexslider|select2/i;

export async function scanSite(input: string): Promise<SiteScan | null> {
  const start = /^https?:\/\//i.test(input) ? input.trim() : `https://${input.trim()}`;
  const home = await getText(start, "text/html", 1_500_000);
  if (!home) return null;
  const base = home.url;
  const host = new URL(base).hostname.replace(/^www\./, "");
  const html = home.text;
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 60_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key: string) => attr(metas.find((t) => new RegExp(`(?:name|property)\\s*=\\s*["']${key}["']`, "i").test(t)) ?? "", "content");

  // לוגו: תמונות עם "logo", לוגו מ-JSON-LD, אייקון האתר ותמונת השיתוף
  const logos: SiteScan["logos"] = [];
  const addLogo = (u: string, why: string) => { const a = abs(u, base); if (a && !a.startsWith("data:") && !logos.some((l) => l.url === a)) logos.push({ url: a, why }); };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    const src = attr(t, "src") || attr(t, "data-src") || attr(t, "srcset").split(/\s/)[0];
    if (src && /logo/i.test([src, attr(t, "alt"), attr(t, "class"), attr(t, "id")].join(" "))) addLogo(src, `תמונה באתר (alt: ${attr(t, "alt").slice(0, 40)})`);
  }
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).join("\n").slice(0, 8000);
  for (const m of jsonLd.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/g)) addLogo(m[1], "לוגו מוגדר לגוגל");
  const icons = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel\s*=\s*["'][^"']*icon/i.test(t))
    .sort((a, b) => (parseInt(attr(b, "sizes")) || (/apple/i.test(b) ? 180 : 16)) - (parseInt(attr(a, "sizes")) || (/apple/i.test(a) ? 180 : 16)));
  for (const t of icons.slice(0, 2)) addLogo(attr(t, "href"), `אייקון האתר ${attr(t, "sizes")}`.trim());
  if (meta("og:image")) addLogo(meta("og:image"), "תמונת השיתוף של האתר");

  // קישורים: רשתות, טלפון, מייל, הזמנות ומפות; ודפים פנימיים שכדאי לקרוא
  const links = new Set<string>();
  const inner: string[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    if (/^(tel|mailto):/i.test(href)) { links.add(decodeURIComponent(href)); continue; }
    const a = abs(href, base);
    if (!a) continue;
    const label = visibleText(m[2]).slice(0, 40);
    if (INTERESTING.test(a)) links.add(a);
    else if (new URL(a).hostname.replace(/^www\./, "") === host && PAGE_HINT.test(decodeURIComponent(a) + " " + label)) {
      const clean = a.split("#")[0];
      if (clean !== base && !inner.includes(clean)) inner.push(clean);
    }
  }

  // CSS: צבעים ופונטים מהעיצוב עצמו
  const colors = new Map<string, number>();
  const fontCount = new Map<string, number>();
  const styleText = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n")
    + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";");
  const sheets = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /rel\s*=\s*["']?stylesheet/i.test(t)).map((t) => abs(attr(t, "href"), base)).filter(Boolean);
  const googleFonts = sheets.filter((s) => s.includes("fonts.googleapis.com")).flatMap((s) => [...s.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " ")));
  const css = [styleText, ...(await Promise.all(sheets.filter((s) => !s.includes("fonts.googleapis.com") && !VENDOR_CSS.test(s)).slice(0, 4).map((s) => getText(s, "text/css", 600_000)))).map((r) => r?.text ?? "")].join("\n");
  countColors(css, colors);
  for (const h of FRAMEWORK) colors.delete(h);
  // לוגו וקטורי (SVG): הצבעים שבו הם הסימן הכי טוב לצבעי המותג
  const logoColors = new Map<string, number>();
  const svgLogo = logos.find((l) => /\.svg(\?|$)/i.test(l.url));
  if (svgLogo) { const t = await getText(svgLogo.url, "image/svg+xml", 500_000); if (t) countColors(t.text, logoColors); }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const f = m[1].split(",")[0].replace(/["']/g, "").replace(/!important/, "").trim();
    if (f && !/^(inherit|initial|var\(|sans-serif|serif|monospace|system-ui|-apple-system|arial|helvetica|times|menlo|consolas|courier)/i.test(f) && !/icon|awesome|glyph|slick|swiper|flexslider|dashicons|eicons/i.test(f)) fontCount.set(f, (fontCount.get(f) ?? 0) + 1);
  }
  const themeColor = normHex(meta("theme-color").match(/#[0-9a-f]{3,8}/i)?.[0] ?? "");

  // עוד דפים מהאתר – רק טקסט
  const pages = await Promise.all(inner.slice(0, 3).map((u) => getText(u, "text/html", 1_000_000)));
  const text = [
    `[דף הבית] ${visibleText(html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html)}`,
    ...pages.map((p, i) => (p ? `[${inner[i]}] ${visibleText(p.text.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? p.text)}` : "")),
  ].filter(Boolean).join("\n\n").slice(0, 30_000);

  return {
    url: base,
    title: decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(),
    description: meta("description") || meta("og:description"),
    themeColor,
    text,
    jsonLd,
    links: [...links].slice(0, 60),
    colors: [...colors].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count).slice(0, 25),
    fonts: [...new Set([...googleFonts, ...[...fontCount].sort((a, b) => b[1] - a[1]).map(([f]) => f)])].slice(0, 8),
    logos: logos.slice(0, 8),
    logoColors: [...logoColors].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 6),
  };
}
