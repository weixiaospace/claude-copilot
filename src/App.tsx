import { useEffect, useState } from "preact/hooks";
import {
  appView,
  fsTick,
  providersTick,
  initSidebarWidth,
  reloadActiveProfiles,
  reloadScopes,
  scopes,
  selectedScopeId,
} from "./lib/signals";
import { initLocale, t } from "./lib/i18n";
import { initTheme } from "./lib/theme";
import { invoke, listen } from "./lib/ipc";
import { runUpdateCheck } from "./lib/updater";
import { AppHeader } from "./components/AppHeader";
import { ScopeSidebar } from "./components/ScopeSidebar";
import { ProviderActivation } from "./components/ProviderActivation";
import { ResourceArea } from "./components/ResourceArea";
import { ConnectionsPage } from "./components/ConnectionsPage";
import { WelcomeDialog } from "./components/WelcomeDialog";

export function App() {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    void initLocale();
    void initTheme();
    void initSidebarWidth();
    void reloadScopes();
    invoke("get_welcome_seen")
      .then((seen) => {
        if (!seen) setShowWelcome(true);
      })
      .catch(() => {});
    void runUpdateCheck(true);

    let offFs: (() => void) | undefined;
    let offProviders: (() => void) | undefined;
    listen("resource-changed", () => {
      fsTick.value++;
    })
      .then((u) => (offFs = u))
      .catch(() => {});
    listen("providers-changed", () => {
      providersTick.value++;
      void reloadActiveProfiles();
    })
      .then((u) => (offProviders = u))
      .catch(() => {});
    return () => {
      offFs?.();
      offProviders?.();
    };
  }, []);

  const selected = scopes.value.find((s) => s.id === selectedScopeId.value);
  const title = !selected
    ? t("app.noScopeSelected")
    : selected.kind === "user"
      ? t("scope.user")
      : selected.label;

  return (
    <div class="flex h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <AppHeader />
      <div class="flex min-h-0 flex-1">
        <ScopeSidebar />
        <main class="flex min-w-0 flex-1 flex-col">
          {appView.value === "connections" ? (
            <ConnectionsPage />
          ) : (
            <>
              <header class="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
                <div class="min-w-0">
                  <h1 class="truncate text-sm font-medium">{title}</h1>
                  {selected?.path && (
                    <p class="truncate text-xs text-neutral-400">{selected.path}</p>
                  )}
                </div>
                <div class="flex items-center gap-3">
                  {selected && (
                    <ProviderActivation
                      key={`${selected.id}:${providersTick.value}`}
                      scope={selected}
                    />
                  )}
                </div>
              </header>
              <div class="min-h-0 flex-1">
                {selected && <ResourceArea key={selected.id} scope={selected} />}
              </div>
            </>
          )}
        </main>
      </div>

      <WelcomeDialog
        open={showWelcome}
        onClose={() => {
          setShowWelcome(false);
          void invoke("mark_welcome_seen").catch(() => {});
        }}
      />
    </div>
  );
}
