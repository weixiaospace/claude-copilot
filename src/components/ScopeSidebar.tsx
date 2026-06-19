import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "../lib/ipc";
import { reloadScopes, scopes, scopesError, selectedScopeId } from "../lib/signals";
import { t } from "../lib/i18n";
import type { Scope } from "../types/Scope";
import { Button } from "./ui/button";

async function addProject() {
  const dir = await open({
    directory: true,
    multiple: false,
    title: t("dialog.addProjectTitle"),
  });
  if (typeof dir === "string") {
    await reloadScopes(await invoke("add_project", { path: dir }));
  }
}

async function removeProject(scope: Scope) {
  await reloadScopes(await invoke("remove_manual_project", { id: scope.id }));
}

function ScopeRow({ scope }: { scope: Scope }) {
  const selected = selectedScopeId.value === scope.id;
  const removable = scope.source === "manual" || scope.source === "both";
  const label = scope.kind === "user" ? t("scope.user") : scope.label;
  const rowClass = [
    "flex-1 inline-flex items-center gap-2 text-left rounded-md px-3 py-1.5 text-sm transition-colors",
    selected
      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
    scope.stale ? "opacity-50" : "",
  ].join(" ");

  return (
    <div class="group flex items-center gap-0.5">
      <button
        class={rowClass}
        title={scope.path ?? undefined}
        onClick={() => {
          selectedScopeId.value = scope.id;
        }}
      >
        <span>{scope.kind === "user" ? "🏠" : "📁"}</span>
        <span class="truncate">{label}</span>
        {scope.stale && (
          <span class="ml-auto text-xs text-amber-500" title={t("sidebar.stale")}>
            ⚠
          </span>
        )}
      </button>
      {removable && (
        <button
          class="shrink-0 px-1.5 text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          title={t("sidebar.removeProject")}
          aria-label={t("sidebar.removeProject")}
          onClick={() => void removeProject(scope)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function ScopeSidebar() {
  const all = scopes.value;
  const user = all.find((s) => s.kind === "user");
  const projects = all.filter((s) => s.kind === "project");

  return (
    <aside class="flex h-full w-60 shrink-0 flex-col gap-1 border-r border-neutral-200 p-2 dark:border-neutral-800">
      {user && <ScopeRow scope={user} />}

      <div class="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {t("sidebar.projects")}
      </div>
      <div class="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {projects.map((s) => (
          <ScopeRow key={s.id} scope={s} />
        ))}
        {projects.length === 0 && (
          <div class="px-3 py-1 text-sm text-neutral-400">{t("sidebar.noProjects")}</div>
        )}
      </div>

      {scopesError.value && (
        <div class="px-3 py-1 text-xs text-red-500">{scopesError.value}</div>
      )}

      <div class="border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <Button variant="ghost" class="w-full" onClick={() => void addProject()}>
          ➕ {t("sidebar.addProject")}
        </Button>
      </div>
    </aside>
  );
}
