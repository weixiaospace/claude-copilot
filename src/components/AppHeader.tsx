import { useEffect, useState } from "preact/hooks";
import { getVersion } from "@tauri-apps/api/app";
import { Plug, RefreshCw } from "lucide-preact";
import logoUrl from "../../src-tauri/icons/128x128.png";
import { appView, fsTick, providersTick, reloadActiveProfiles, reloadScopes } from "../lib/signals";
import { t } from "../lib/i18n";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Global refresh: reload the scope list + every open panel in place. */
function refreshAll() {
  void reloadScopes();
  void reloadActiveProfiles();
  providersTick.value++;
  fsTick.value++;
}

/** Full-width product header: brand on the left, Connections nav + global
 *  controls on the right. */
export function AppHeader() {
  const onConnections = appView.value === "connections";
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  return (
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <div class="flex items-center gap-2.5">
        <img src={logoUrl} alt="" class="h-7 w-7 rounded-lg" />
        <span class="font-serif text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Claude <span class="text-accent">Copilot</span>
        </span>
        {version && (
          <span class="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
            v{version}
          </span>
        )}
      </div>
      <div class="flex items-center gap-2">
        <button
          class={
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
            (onConnections
              ? "bg-accent-soft text-accent dark:bg-accent-soft-dark"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800")
          }
          onClick={() => (appView.value = "connections")}
        >
          <Plug size={16} />
          {t("providers.title")}
        </button>
        <button
          class="inline-flex items-center justify-center rounded-md p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          onClick={refreshAll}
          title={t("common.refreshAll")}
          aria-label={t("common.refreshAll")}
        >
          <RefreshCw size={16} />
        </button>
        <div class="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
