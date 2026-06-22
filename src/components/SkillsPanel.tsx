import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderGit,
  Package,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-preact";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import type { SkillSource } from "../types/SkillSource";
import type { SourceSkill } from "../types/SourceSkill";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { toast } from "../lib/toast";
import { recordUpdated } from "../lib/updateTimes";
import { useFsRefresh } from "../lib/useFsRefresh";
import { ResourceDetail } from "./ResourceDetail";
import { PanelHeader } from "./PanelHeader";
import { Segmented } from "./ui/Segmented";
import { CreateNameDialog } from "./CreateNameDialog";
import { LastUpdated } from "./LastUpdated";

const card =
  "rounded-lg border border-neutral-200 p-3 transition-colors dark:border-neutral-800";

type Tab = "installed" | "sources";

function Badge({ children, tone = "neutral" }: { children: any; tone?: "neutral" | "accent" | "success" }) {
  const cls =
    tone === "accent"
      ? "bg-accent-soft text-accent dark:bg-accent-soft-dark"
      : tone === "success"
        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span class={"shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + cls}>{children}</span>
  );
}

export function SkillsPanel({
  scope,
  onCreateSkill,
}: {
  scope: ScopeRef;
  onCreateSkill: (name: string) => Promise<unknown>;
}) {
  const storageKey = `skills-panel:${scope.kind}:${(scope as { id?: string }).id ?? "user"}`;
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(`${storageKey}:tab`) as Tab) || "installed";
    } catch {
      return "installed";
    }
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      localStorage.setItem(`${storageKey}:tab`, next);
    } catch {}
  };

  const [installed, setInstalled] = useState<FileResource[]>([]);
  const [sources, setSources] = useState<SkillSource[]>([]);
  const [expanded, setExpandedState] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`${storageKey}:expanded`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  const setExpanded = (updater: (cur: Set<string>) => Set<string>) => {
    setExpandedState((cur) => {
      const next = updater(cur);
      try {
        localStorage.setItem(`${storageKey}:expanded`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const [selected, setSelected] = useState<FileResource | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [busy, setBusy] = useState(false);
  // Name of the source currently being updated — drives the per-row spinner.
  const [updatingSource, setUpdatingSource] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function showError(e: unknown) {
    toast.error(String(e));
  }

  async function refreshInstalled() {
    try {
      const items = await invoke("list_skills", { scope });
      setInstalled(items);
    } catch (e) {
      await showError(e);
    }
  }

  async function refreshSources() {
    try {
      const items = await invoke("list_skill_sources", { scope });
      setSources(items);
    } catch (e) {
      await showError(e);
    }
  }

  async function refresh() {
    await Promise.all([refreshInstalled(), refreshSources()]);
  }

  useEffect(() => {
    void refresh().then(() => {
      requestAnimationFrame(() => {
        try {
          const saved = localStorage.getItem(`${storageKey}:scrollTop`);
          if (saved && scrollRef.current) {
            scrollRef.current.scrollTop = Number(saved);
          }
        } catch {}
      });
    });
  }, [JSON.stringify(scope)]);
  // In-place reload on fs/global refresh; the panel no longer remounts, so the
  // localStorage scroll/tab restoration above is only needed on scope switch.
  useFsRefresh(refresh);

  // Wrap a mutation: refresh + restore scroll on success, surface the result as
  // a toast. `pending` shows a live "loading → done" toast for slow, network-
  // bound ops (clone/update); otherwise only a terminal toast is shown.
  async function run(
    fn: () => Promise<unknown>,
    opts: { success?: string; pending?: string } = {},
  ) {
    setBusy(true);
    const savedScrollTop = scrollRef.current?.scrollTop ?? 0;
    try {
      const work = (async () => {
        await fn();
        await refresh();
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
        });
      })();
      if (opts.pending) {
        await toast.promise(work, {
          loading: opts.pending,
          success: opts.success ?? t("common.done"),
          error: (e) => String(e),
        });
      } else {
        await work;
        if (opts.success) toast.success(opts.success);
      }
    } catch (e) {
      if (!opts.pending) showError(e);
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(name: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const allSourceNames = useMemo(() => sources.map((s) => s.name), [sources]);

  const displayName = (name: string) => {
    const parts = name.split("/");
    const repo = parts[parts.length - 1];
    const ownerRepo = parts.length >= 2 ? `${parts[parts.length - 2]}/${repo}` : repo;

    const repoCount = allSourceNames.filter((n) => n.endsWith(`/${repo}`)).length;
    if (repoCount === 1) return repo;

    const ownerRepoCount = allSourceNames.filter((n) => {
      const ps = n.split("/");
      return ps.length >= 2 && `${ps[ps.length - 2]}/${ps[ps.length - 1]}` === ownerRepo;
    }).length;
    if (ownerRepoCount === 1) return ownerRepo;

    return name;
  };

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        title={t("skills.title")}
        extra={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "installed", label: `${t("skills.installed")} (${installed.length})` },
              { value: "sources", label: `${t("skills.sources")} (${sources.length})` },
            ]}
          />
        }
        onRefresh={() => refresh()}
        createLabel={tab === "sources" ? t("skills.addSource") : t("resource.create")}
        onCreate={
          tab === "sources" ? () => setAddingSource(true) : () => setCreatingSkill(true)
        }
      />

      <div
        ref={scrollRef}
        class="min-h-0 flex-1 overflow-auto px-6 pb-6"
        onScroll={() => {
          try {
            localStorage.setItem(
              `${storageKey}:scrollTop`,
              String(scrollRef.current?.scrollTop ?? 0),
            );
          } catch {}
        }}
      >
        {tab === "installed" && (
          <div class="flex flex-col gap-2">
            {installed.length === 0 && (
              <div class="py-8 text-sm text-neutral-400">{t("skills.empty")}</div>
            )}
            {installed.map((s) => (
              <div key={s.path} class={card}>
                <div class="flex items-center gap-2">
                  <Package size={16} class="shrink-0 text-neutral-400" />
                  <button
                    class="text-left text-sm font-semibold hover:text-accent"
                    onClick={() => setSelected(s)}
                  >
                    {s.name}
                  </button>
                  <div class="flex-1" />
                  <button
                    class="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 disabled:opacity-50"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        if (await confirm(t("skills.confirmUninstall"), { kind: "warning" })) {
                          await run(() => invoke("uninstall_skill", { name: s.name, scope }), {
                            success: t("skills.uninstalledSuccess"),
                          });
                        }
                      })()
                    }
                  >
                    <Trash2 size={13} /> {t("detail.delete")}
                  </button>
                </div>
                {s.description && (
                  <div class="mt-1 truncate pl-6 text-xs text-neutral-500">{s.description}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "sources" && (
          <div class="flex flex-col gap-2">
            {sources.length === 0 && (
              <div class="py-8 text-sm text-neutral-400">{t("skills.noSources")}</div>
            )}
            {sources.map((source) => {
              const isOpen = expanded.has(source.name);
              return (
                <div key={source.name} class={card}>
                  <div class="flex items-center gap-2">
                    <FolderGit size={16} class="shrink-0 text-neutral-400" />
                    <span class="text-sm font-semibold">{displayName(source.name)}</span>
                    <Badge>{source.skills.length}</Badge>
                    <div class="flex-1" />
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
                      disabled={busy}
                      onClick={() => {
                        setUpdatingSource(source.name);
                        void run(
                          async () => {
                            await invoke("update_skill_source", { name: source.name });
                            recordUpdated("source", source.name);
                          },
                          { pending: t("skills.sourceUpdating"), success: t("skills.sourceUpdated") },
                        ).finally(() => setUpdatingSource(null));
                      }}
                    >
                      <RefreshCw size={13} class={updatingSource === source.name ? "animate-spin" : ""} />{" "}
                      {t("skills.updateSource")}
                    </button>
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (await confirm(t("skills.confirmRemoveSource"), { kind: "warning" })) {
                            await run(() => invoke("remove_skill_source", { name: source.name }), {
                              success: t("skills.sourceRemoved"),
                            });
                          }
                        })()
                      }
                    >
                      <Trash2 size={13} /> {t("detail.delete")}
                    </button>
                    <button
                      class="shrink-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                      onClick={() => toggleExpand(source.name)}
                    >
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                  <div class="mt-1 truncate pl-6 font-mono text-xs text-neutral-400" title={source.url}>
                    {source.url}
                  </div>
                  <LastUpdated kind="source" name={source.name} class="mt-1 pl-6" />

                  {isOpen && (
                    <div class="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                      {source.skills.length === 0 ? (
                        <div class="text-xs text-neutral-400">{t("skills.noSkillsInSource")}</div>
                      ) : (
                        <ul class="flex flex-col gap-1">
                          {source.skills.map((skill: SourceSkill) => (
                            <li key={skill.name} class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                              <Store size={14} class="shrink-0 text-neutral-400" />
                              <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                  <span class="text-sm font-medium">{skill.name}</span>
                                  {skill.installed && (
                                    <Badge tone="success">{t("skills.installed")}</Badge>
                                  )}
                                  {skill.update_available && (
                                    <Badge tone="accent">{t("skills.updateAvailable")}</Badge>
                                  )}
                                </div>
                                {skill.description && (
                                  <div class="truncate text-xs text-neutral-500">{skill.description}</div>
                                )}
                              </div>
                              <button
                                class="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () =>
                                      invoke("install_skill_from_source", {
                                        source: source.name,
                                        skill: skill.name,
                                        scope,
                                      }),
                                    {
                                      pending: t("skills.installingSkill"),
                                      success: t("skills.installedSuccess"),
                                    },
                                  )
                                }
                              >
                                <Download size={13} />
                                {skill.installed
                                  ? skill.update_available
                                    ? t("skills.update")
                                    : t("skills.reinstall")
                                  : t("skills.install")}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ResourceDetail resource={selected} onClose={() => setSelected(null)} readOnly />

      <CreateNameDialog
        open={addingSource}
        title={t("skills.addSource")}
        placeholder={t("skills.addSourcePlaceholder")}
        onClose={() => setAddingSource(false)}
        onCreate={async (url) => {
          await run(() => invoke("add_skill_source", { url }), {
            pending: t("skills.addingSource"),
            success: t("skills.sourceAdded"),
          });
          setAddingSource(false);
        }}
      />

      <CreateNameDialog
        open={creatingSkill}
        title={t("resource.create")}
        placeholder={t("resource.namePlaceholder")}
        onClose={() => setCreatingSkill(false)}
        onCreate={async (name) => {
          await run(() => onCreateSkill(name));
          setCreatingSkill(false);
        }}
      />
    </div>
  );
}
