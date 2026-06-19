import { signal } from "@preact/signals";
import en from "../i18n/en.json";
import zhCn from "../i18n/zh-cn.json";
import { invoke } from "./ipc";

export type Locale = "en" | "zh-cn";

const FALLBACK: Locale = "zh-cn";

const bundles: Record<Locale, Record<string, string>> = {
  en,
  "zh-cn": zhCn,
};

/** Active locale. Components that call `t()` re-render when this changes. */
export const locale = signal<Locale>(FALLBACK);

/**
 * Translate `key` for the active locale, substituting positional `{0}`, `{1}`…
 * placeholders. Falls back to the fallback bundle, then the raw key.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const dict = bundles[locale.value] ?? bundles[FALLBACK];
  let out = dict[key] ?? bundles[FALLBACK][key] ?? key;
  args.forEach((arg, i) => {
    out = out.replace(`{${i}}`, String(arg));
  });
  return out;
}

function normalize(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower.startsWith("zh")) return "zh-cn";
  return null;
}

/** Resolve the startup locale: persisted → system → fallback. */
export async function initLocale(): Promise<void> {
  let resolved: Locale | null = null;
  try {
    resolved = normalize(await invoke("get_locale"));
  } catch {
    // state unavailable; fall through to system/fallback
  }
  if (!resolved) resolved = normalize(navigator.language);
  locale.value = resolved ?? FALLBACK;
}

/** Switch locale instantly and persist the choice. */
export async function setLocale(next: Locale): Promise<void> {
  locale.value = next;
  try {
    await invoke("set_locale", { locale: next });
  } catch (e) {
    console.error("set_locale failed", e);
  }
}
