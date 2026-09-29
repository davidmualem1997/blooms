// כל מקורות הנתונים ש-BLOOMS יודע (או ידע) להתחבר אליהם. כל מחבר ממלא את אותם שדות בדוח –
// מה שלא מחובר אפשר להזין ידנית.
export type Provider = "meta" | "tiktok" | "ga4" | "shopify" | "woocommerce" | "wix" | "webflow";

export const PROVIDERS: { k: Provider; l: string; gives: string; soon: boolean }[] = [
  { k: "meta", l: "Instagram + Facebook", gives: "עוקבים, חשיפה, צפיות, כניסות לפרופיל, קליקים, ונתונים לכל פוסט – מתעדכן כל לילה", soon: false },
  { k: "tiktok", l: "TikTok", gives: "צפיות, לייקים ושיתופים לכל סרטון, ועוקבים", soon: true },
  { k: "ga4", l: "Google Analytics", gives: "כניסות לאתר מהסושיאל והמרות", soon: true },
  { k: "shopify", l: "Shopify", gives: "הכנסות, הזמנות, מוצרים מובילים והזמנות מהסושיאל", soon: true },
  { k: "woocommerce", l: "WooCommerce", gives: "הכנסות, הזמנות ומוצרים מובילים", soon: true },
  { k: "wix", l: "Wix", gives: "הזמנות, טפסים והזמנות תורים", soon: true },
  { k: "webflow", l: "Webflow", gives: "הזמנות וטפסים", soon: true },
];
