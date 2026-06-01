// i18n — flat key lookup with variable interpolation.
//
// Strings live in en.json and zh.json. Add a key in BOTH files when
// introducing new UI text — `npm test` enforces parity.

import en from "../assets/i18n/en.json";
import zh from "../assets/i18n/zh.json";
import { detectSystemLanguage } from "../api/tauri";
import type { Lang } from "../config/types";

const DICTS: Record<Lang, Record<string, string>> = { en, zh };

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const dict = DICTS[lang] ?? DICTS.en;
  let str = dict[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const k in vars) str = str.replace(`{${k}}`, String(vars[k]));
  }
  return str;
}

export async function detectSystemLang(): Promise<Lang> {
  try {
    const tag = await detectSystemLanguage();
    return tag === "zh" ? "zh" : "en";
  } catch {
    // Browser fallback (dev / vite mode without Tauri)
    return (navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en") as Lang;
  }
}
