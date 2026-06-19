import { useEffect } from "preact/hooks";
import { reloadScopes, scopes, selectedScopeId } from "./lib/signals";
import { ScopeSidebar } from "./components/ScopeSidebar";

export function App() {
  useEffect(() => {
    void reloadScopes();
  }, []);

  const selected = scopes.value.find((s) => s.id === selectedScopeId.value);

  return (
    <div class="flex h-full bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <ScopeSidebar />
      <main class="flex-1 p-6">
        <h1 class="text-sm font-medium text-neutral-500">
          {selected ? selected.label : "No scope selected"}
        </h1>
        {selected?.path && (
          <p class="mt-1 text-xs text-neutral-400">{selected.path}</p>
        )}
      </main>
    </div>
  );
}
