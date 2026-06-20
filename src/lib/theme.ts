import { signal } from "@preact/signals";
import { invoke } from "./ipc";

export type Theme = "system" | "light" | "dark";

const FALLBACK: Theme = "system";

/** Active theme preference. Components reading it re-render when it changes. */
export const theme = signal<Theme>(FALLBACK);

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Whether a preference resolves to dark right now. */
function resolvesDark(t: Theme): boolean {
  return t === "dark" || (t === "system" && darkQuery.matches);
}

/** Reflect the active preference onto <html> (toggles the `.dark` class). */
export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle("dark", resolvesDark(t));
}

// Keep "system" live: follow OS changes while that preference is active.
darkQuery.addEventListener("change", () => {
  if (theme.value === "system") applyTheme("system");
});

function normalize(raw: string | null | undefined): Theme | null {
  return raw === "system" || raw === "light" || raw === "dark" ? raw : null;
}

/** Resolve the startup theme: persisted → fallback (system). */
export async function initTheme(): Promise<void> {
  let resolved: Theme | null = null;
  try {
    resolved = normalize(await invoke("get_theme"));
  } catch {
    // state unavailable; fall through to fallback
  }
  theme.value = resolved ?? FALLBACK;
  applyTheme(theme.value);
}

/** Switch theme instantly and persist the choice. */
export async function setTheme(next: Theme): Promise<void> {
  theme.value = next;
  applyTheme(next);
  try {
    await invoke("set_theme", { theme: next });
  } catch (e) {
    console.error("set_theme failed", e);
  }
}
