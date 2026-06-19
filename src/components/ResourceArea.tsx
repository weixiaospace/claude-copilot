import { useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourcePanel } from "./ResourcePanel";
import { HooksPanel } from "./HooksPanel";
import { MemoryPanel } from "./MemoryPanel";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

type TabKey = "skills" | "agents" | "workflows" | "rules" | "hooks" | "memory";
type ResourceTabKey = "skills" | "agents" | "workflows" | "rules";

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: "skills", label: "resource.skills" },
  { key: "agents", label: "resource.agents" },
  { key: "workflows", label: "resource.workflows" },
  { key: "rules", label: "resource.rules" },
  { key: "hooks", label: "hooks.title" },
];

interface PanelProps {
  load: () => Promise<FileResource[]>;
  create?: (name: string) => Promise<unknown>;
  remove: (resource: FileResource) => Promise<boolean>;
  namePlaceholder: string;
}

async function confirmDelete(): Promise<boolean> {
  return confirm(t("detail.confirmDelete"), { kind: "warning" });
}

function panelProps(tab: ResourceTabKey, scope: ScopeRef): PanelProps {
  const namePlaceholder = t("resource.namePlaceholder");

  // Skills delete their whole directory; flat resources delete a single file.
  const deleteSkill = async (r: FileResource): Promise<boolean> => {
    if (!(await confirmDelete())) return false;
    await invoke("delete_skill", { path: r.path });
    return true;
  };
  const deleteFile = async (r: FileResource): Promise<boolean> => {
    if (!(await confirmDelete())) return false;
    await invoke("delete_resource", { path: r.path });
    return true;
  };

  switch (tab) {
    case "skills":
      return {
        load: () => invoke("list_skills", { scope }),
        create: (name) => invoke("create_skill", { scope, name }),
        remove: deleteSkill,
        namePlaceholder,
      };
    case "agents":
      return {
        load: () => invoke("list_agents", { scope }),
        create: (name) => invoke("create_agent", { scope, name }),
        remove: deleteFile,
        namePlaceholder,
      };
    case "rules":
      return {
        load: () => invoke("list_rules", { scope }),
        create: (name) => invoke("create_rule", { scope, name }),
        remove: deleteFile,
        namePlaceholder,
      };
    case "workflows":
      return {
        load: () => invoke("list_workflows", { scope }),
        remove: deleteFile,
        namePlaceholder,
      };
  }
}

/**
 * The main area for a selected scope: resource tabs + the active panel. Tabs
 * available depend on the scope (Memory is project-only). Remounted per scope
 * (keyed in App), so the active tab resets when the scope changes.
 */
export function ResourceArea({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  const tabs =
    scope.kind === "project"
      ? [...BASE_TABS, { key: "memory" as TabKey, label: "resource.memory" }]
      : BASE_TABS;
  const [tab, setTab] = useState<TabKey>("skills");

  return (
    <div class="flex h-full flex-col">
      <div class="flex gap-4 border-b border-neutral-200 px-6 dark:border-neutral-800">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            class={
              "-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors " +
              (tab === tb.key
                ? "border-neutral-900 text-neutral-900 dark:border-white dark:text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200")
            }
            onClick={() => setTab(tb.key)}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>
      <div class="min-h-0 flex-1">
        {tab === "memory" && scope.kind === "project" ? (
          <MemoryPanel key={`${scope.id}:memory`} projectId={scope.id} />
        ) : tab === "hooks" ? (
          <HooksPanel key={`${scope.id}:hooks`} scope={ref} />
        ) : (
          <ResourcePanel
            key={`${scope.id}:${tab}`}
            {...panelProps(tab as ResourceTabKey, ref)}
          />
        )}
      </div>
    </div>
  );
}
