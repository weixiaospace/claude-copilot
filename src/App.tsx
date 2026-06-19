import { useEffect } from "preact/hooks";
import { reloadScopes, scopes, selectedScopeId } from "./lib/signals";
import { initLocale, t } from "./lib/i18n";
import { ScopeSidebar } from "./components/ScopeSidebar";
import { LocaleSwitcher } from "./components/LocaleSwitcher";

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
      <main class="flex-1 p-6">
        <div class="flex items-center justify-between gap-4">
          <h1 class="truncate text-sm font-medium text-neutral-500">{title}</h1>
          <LocaleSwitcher />
        </div>
        {selected?.path && (
          <p class="mt-1 text-xs text-neutral-400">{selected.path}</p>
        )}
      </main>
    </div>
  );
}
