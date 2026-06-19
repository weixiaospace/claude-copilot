import { useEffect } from "preact/hooks";
import { reloadScopes, scopes, selectedScopeId } from "./lib/signals";
import { initLocale, t } from "./lib/i18n";
import { ScopeSidebar } from "./components/ScopeSidebar";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ResourceArea } from "./components/ResourceArea";

export function App() {
  useEffect(() => {
    void initLocale();
    void reloadScopes();
  }, []);

  const selected = scopes.value.find((s) => s.id === selectedScopeId.value);
  const title = !selected
    ? t("app.noScopeSelected")
    : selected.kind === "user"
      ? t("scope.user")
      : selected.label;

  return (
    <div class="flex h-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <ScopeSidebar />
      <main class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
          <div class="min-w-0">
            <h1 class="truncate text-sm font-medium">{title}</h1>
            {selected?.path && (
              <p class="truncate text-xs text-neutral-400">{selected.path}</p>
            )}
          </div>
          <LocaleSwitcher />
        </header>
        <div class="min-h-0 flex-1">
          {selected && <ResourceArea key={selected.id} scope={selected} />}
        </div>
      </main>
    </div>
  );
}
