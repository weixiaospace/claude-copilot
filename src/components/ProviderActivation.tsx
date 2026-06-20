import { useState } from "preact/hooks";
import { Check, ChevronDown, Plug } from "lucide-preact";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { activeByScope, appView, profiles, providersTick, reloadActiveProfiles } from "../lib/signals";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onClick={onClick}
    >
      <Check size={14} class={"shrink-0 " + (active ? "text-accent" : "opacity-0")} />
      <span class="truncate">{label}</span>
    </button>
  );
}

/**
 * Header quick-switch for the scope's active provider (接入). Shows the current
 * profile / subscription / external state and a dropdown to switch it. Reads the
 * shared `activeByScope`/`profiles` signals so it stays in sync with the sidebar.
 */
export function ProviderActivation({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  const [open, setOpen] = useState(false);
  const active = activeByScope.value[scope.id];
  const ps = profiles.value;

  const activeName =
    active?.state === "profile"
      ? (ps.find((p) => p.id === active.id)?.name ?? t("activation.unmanaged"))
      : active?.state === "unmanaged"
        ? t("activation.unmanaged")
        : t("activation.subscription");

  async function choose(action: () => Promise<unknown>) {
    setOpen(false);
    try {
      await action();
      await reloadActiveProfiles();
      providersTick.value++; // nudge SettingsPanel (env block changed) to re-read
    } catch (e) {
      console.error("activation failed", e);
    }
  }

  return (
    <div class="relative">
      <button
        class="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        title={t("activation.label")}
        onClick={() => setOpen((v) => !v)}
      >
        <Plug size={15} class="shrink-0 text-neutral-400" />
        <span class="max-w-44 truncate">{activeName}</span>
        <ChevronDown size={14} class="shrink-0 text-neutral-400" />
      </button>

      {open && (
        <>
          <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div class="absolute right-0 top-full z-20 mt-1 min-w-52 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <MenuItem
              label={t("activation.subscription")}
              active={!active || active.state === "subscription"}
              onClick={() => void choose(() => invoke("deactivate_provider", { scope: ref }))}
            />
            {active?.state === "unmanaged" && (
              <MenuItem label={t("activation.unmanaged")} active onClick={() => setOpen(false)} />
            )}
            {ps.length > 0 && (
              <div class="my-1 border-t border-neutral-200 dark:border-neutral-800" />
            )}
            {ps.map((p) => (
              <MenuItem
                key={p.id}
                label={p.name}
                active={active?.state === "profile" && active.id === p.id}
                onClick={() => void choose(() => invoke("activate_profile", { id: p.id, scope: ref }))}
              />
            ))}
            <div class="my-1 border-t border-neutral-200 dark:border-neutral-800" />
            <button
              class="block w-full px-3 py-1.5 text-left text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                setOpen(false);
                appView.value = "connections";
              }}
            >
              {t("activation.manage")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
