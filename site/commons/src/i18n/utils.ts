import en from "./en";
import zhCN from "./zh-CN";

const translations = { en, "zh-CN": zhCN } as const;
type Lang = keyof typeof translations;

export function t(lang: string) {
  const key = lang in translations ? (lang as Lang) : "en";
  return translations[key];
}

export function getLangFromUrl(url: URL): Lang {
  const seg = url.pathname.split("/")[1];
  if (seg === "zh-CN") return "zh-CN";
  return "en";
}
