import { Plug } from "lucide-preact";
import logoUrl from "../../src-tauri/icons/128x128.png";
import { appView } from "../lib/signals";
import { t } from "../lib/i18n";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Full-width product header: brand on the left, Connections nav + global
 *  controls on the right. */
export function AppHeader() {
  const onConnections = appView.value === "connections";
  return (
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <div class="flex items-center gap-2.5">
        <img src={logoUrl} alt="" class="h-7 w-7 rounded-lg" />
        <span class="font-serif text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Claude <span class="text-accent">Copilot</span>
        </span>
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
        <div class="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
