import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import { t } from "../lib/i18n";
import { SkillsPanel } from "./SkillsPanel";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user"
    ? { kind: "user" }
    : { kind: "project", id: scope.id };
}

/**
 * The main area for a selected scope: resource tabs + the active panel. Slice 8
 * ships Skills; more tabs (Agents, Settings, …) arrive in later slices.
 */
export function ResourceArea({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  return (
    <div class="flex h-full flex-col">
      <div class="flex gap-1 border-b border-neutral-200 px-6 dark:border-neutral-800">
        <div class="-mb-px border-b-2 border-neutral-900 px-1 py-2 text-sm font-medium dark:border-white">
          {t("resource.skills")}
        </div>
      </div>
      <div class="min-h-0 flex-1">
        {/* keyed by scope so panel state resets when the scope changes */}
        <SkillsPanel key={scope.id} scope={ref} />
      </div>
    </div>
  );
}
