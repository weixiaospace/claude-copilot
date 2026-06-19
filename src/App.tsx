import { useEffect } from "preact/hooks";
import { invoke } from "./lib/ipc";
import { scopes, selectedScopeId } from "./lib/signals";
import { ScopeSidebar } from "./components/ScopeSidebar";

export function App() {
  useEffect(() => {
    invoke("list_scopes")
      .then((s) => {
        scopes.value = s;
        if (!selectedScopeId.value && s.length > 0) {
          selectedScopeId.value = s[0].id;
        }
      })
      .catch((e) => console.error("list_scopes failed", e));
  }, []);

  return (
    <div class="flex h-full text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-950">
      <ScopeSidebar />
      <main class="flex-1 p-6">
        <h1 class="text-sm font-medium text-neutral-500">
          {selectedScopeId.value
            ? `Scope: ${selectedScopeId.value}`
            : "No scope selected"}
        </h1>
      </main>
    </div>
  );
}
