import { scopes, selectedScopeId } from "../lib/signals";
import { Button } from "./ui/button";

export function ScopeSidebar() {
  return (
    <aside class="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 p-2 flex flex-col gap-1">
      {scopes.value.map((s) => (
        <Button
          key={s.id}
          variant={selectedScopeId.value === s.id ? "active" : "ghost"}
          onClick={() => {
            selectedScopeId.value = s.id;
          }}
        >
          <span class="mr-2">{s.kind === "user" ? "🏠" : "📁"}</span>
          {s.label}
        </Button>
      ))}
    </aside>
  );
}
