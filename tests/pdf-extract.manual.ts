// בדיקה ידנית (עולה כמה סנטים): npx tsx --conditions=react-server --env-file=.env.local tests/pdf-extract.manual.ts <קובץ.pdf>
import { readFileSync } from "node:fs";
import { extractBrandFromPdf } from "@/lib/brand-extract";
(async () => {
  const file = process.argv[2];
  const out = await extractBrandFromPdf(readFileSync(file), "test.pdf");
  const json = JSON.stringify(out);
  console.log("password-like text present:", /סיסמ|password|passwd/i.test(json));
  for (const [k, v] of Object.entries(out)) {
    const size = Array.isArray(v) ? `${v.length} items` : typeof v === "object" ? Object.values(v).filter(Boolean).length + " filled" : `${String(v).length} chars`;
    console.log(k.padEnd(10), size, "|", (Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 90).replace(/\n/g, " / "));
  }
})();
