import { useState } from "preact/hooks";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  House,
  TriangleAlert,
  X,
} from "lucide-preact";
import { invoke } from "../lib/ipc";
import {
  activeByScope,
  appView,
  persistSidebarWidth,
  profiles,
  reloadScopes,
  scopes,
  scopesError,
  selectedScopeId,
  setSidebarWidth,
  sidebarWidth,
} from "../lib/signals";
import { t } from "../lib/i18n";
import type { Scope } from "../types/Scope";

const OPEN_APPS: { id: string; key: string }[] = [
  { id: "vscode", key: "project.openVscode" },
  { id: "zed", key: "project.openZed" },
  { id: "cmux", key: "project.openCmux" },
];

async function removeProject(scope: Scope) {
  await reloadScopes(await invoke("remove_manual_project", { id: scope.id }));
}

async function openInApp(scope: Scope, app: string) {
  try {
    await invoke("open_in_app", { projectId: scope.id, app });
  } catch (e) {
    console.error("open_in_app failed", e);
  }
}

/** The active 接入 label for a scope, or null when there's nothing to show. */
function activeLabel(scope: Scope): string | null {
  const a = activeByScope.value[scope.id];
  if (!a) return null;
  if (a.state === "subscription") return t("activation.subscription");
  if (a.state === "unmanaged") return t("activation.unmanaged");
  return profiles.value.find((p) => p.id === a.id)?.name ?? t("activation.unmanaged");
}

function ScopeRow({
  scope,
  menuOpen,
  onToggleMenu,
}: {
  scope: Scope;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const selected = selectedScopeId.value === scope.id && appView.value === "scope";
  const removable = scope.source === "manual" || scope.source === "both";
  const isProject = scope.kind === "project";
  const active = activeLabel(scope);

  return (
    <div
      class={
        "group relative rounded-md transition-colors " +
        (selected
          ? "bg-accent-soft dark:bg-accent-soft-dark"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800")
      }
    >
      <div class="flex items-start">
        <button
          class={
            "min-w-0 flex-1 rounded-md px-3 py-1.5 text-left text-sm transition-colors " +
            (selected
              ? "text-neutral-900 dark:text-white"
              : "text-neutral-700 dark:text-neutral-300") +
            (scope.stale ? " opacity-60" : "")
          }
          title={scope.path ?? undefined}
          onClick={() => {
            selectedScopeId.value = scope.id;
            appView.value = "scope";
          }}
        >
          <div class="flex min-w-0 items-center gap-2">
            {scope.kind === "user" ? (
              <House size={15} class="shrink-0" />
            ) : (
              <Folder size={15} class="shrink-0" />
            )}
            <span class="min-w-0 truncate">
              {scope.kind === "user" ? t("scope.user") : scope.label}
            </span>
            {scope.stale && (
              <TriangleAlert
                size={14}
                class="ml-auto shrink-0 text-amber-500"
                aria-label={t("sidebar.stale")}
              />
            )}
          </div>
          {active && (
            <div class="mt-0.5 truncate pl-6 text-xs text-neutral-400" title={active}>{active}</div>
          )}
        </button>

        <div
          class={
            "flex shrink-0 items-center pr-1 pt-1.5 text-neutral-400 transition-opacity " +
            (menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        >
          {isProject && (
            <button
              class="rounded p-1 hover:text-neutral-900 dark:hover:text-white"
              title={t("project.openIn")}
              aria-label={t("project.openIn")}
              onClick={onToggleMenu}
            >
              <Ellipsis size={16} />
            </button>
          )}
          {removable && (
            <button
              class="rounded p-1 hover:text-red-500"
              title={t("sidebar.removeProject")}
              aria-label={t("sidebar.removeProject")}
              onClick={() => void removeProject(scope)}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <>
          <div class="fixed inset-0 z-10" onClick={onToggleMenu} />
          <div class="absolute right-1 top-8 z-20 min-w-36 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {OPEN_APPS.map((a) => (
              <button
                key={a.id}
                class="block w-full px-3 py-1.5 text-left text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={() => {
                  onToggleMenu();
                  void openInApp(scope, a.id);
                }}
              >
                {t(a.key)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ScopeSidebar() {
  const all = scopes.value;
  const user = all.find((s) => s.kind === "user");
  const projects = all.filter((s) => s.kind === "project");
  const liveProjects = projects.filter((s) => !s.stale);
  const staleProjects = projects.filter((s) => s.stale);
  const [showStale, setShowStale] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const toggleMenu = (id: string) => setMenuFor((cur) => (cur === id ? null : id));

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth.value;
    const onMove = (ev: PointerEvent) => setSidebarWidth(startW + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void persistSidebarWidth();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <aside
      class="relative flex h-full shrink-0 flex-col gap-1 border-r border-neutral-200 p-2 dark:border-neutral-800"
      style={{ width: `${sidebarWidth.value}px` }}
    >
      {user && (
        <ScopeRow
          scope={user}
          menuOpen={menuFor === user.id}
          onToggleMenu={() => toggleMenu(user.id)}
        />
      )}

      <div class="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {t("sidebar.projects")}
      </div>
      <div class="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {liveProjects.map((s) => (
          <ScopeRow
            key={s.id}
            scope={s}
            menuOpen={menuFor === s.id}
            onToggleMenu={() => toggleMenu(s.id)}
          />
        ))}
        {projects.length === 0 && (
          <div class="px-3 py-1 text-sm text-neutral-400">{t("sidebar.noProjects")}</div>
        )}

        {staleProjects.length > 0 && (
          <div class="mt-1">
            <button
              class="flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
              onClick={() => setShowStale((v) => !v)}
            >
              {showStale ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span class="truncate">
                {t("sidebar.staleGroup")} ({staleProjects.length})
              </span>
            </button>
            {showStale &&
              staleProjects.map((s) => (
                <ScopeRow
                  key={s.id}
                  scope={s}
                  menuOpen={menuFor === s.id}
                  onToggleMenu={() => toggleMenu(s.id)}
                />
              ))}
          </div>
        )}
      </div>

      {scopesError.value && (
        <div class="px-3 py-1 text-xs text-red-500">{scopesError.value}</div>
      )}

      {/* Drag handle: resize the sidebar; persists on release. */}
      <div
        class="absolute -right-px top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
        title={t("sidebar.dragToResize")}
        onPointerDown={startResize}
      />
    </aside>
  );
}
