import { useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourcePanel } from "./ResourcePanel";
import { HooksPanel } from "./HooksPanel";
import { McpPanel } from "./McpPanel";
import { MemoryPanel } from "./MemoryPanel";
import { OutputStylesPanel } from "./OutputStylesPanel";
import { PluginsPanel } from "./PluginsPanel";
import { SkillsPanel } from "./SkillsPanel";
import { UsagePanel } from "./UsagePanel";
import { SettingsPanel } from "./SettingsPanel";
import { SessionsPanel } from "./SessionsPanel";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

type TabKey =
  | "skills"
  | "agents"
  | "workflows"
  | "rules"
  | "output_styles"
  | "hooks"
  | "mcp"
  | "memory"
  | "plugins"
  | "usage"
  | "settings"
  | "sessions";
type ResourceTabKey = "skills" | "agents" | "workflows" | "rules";

type Tab = { key: TabKey; label: string };

// Order: 会话 → 技能 → MCP → (其余资源) → 记忆 → 用量 → 设置. Sessions/Memory are
// project-only; Plugins is user-only and sits in the "其余" middle group.
const HEAD_TABS: Tab[] = [
  { key: "skills", label: "resource.skills" },
  { key: "mcp", label: "mcp.title" },
];
const MIDDLE_TABS: Tab[] = [
  { key: "agents", label: "resource.agents" },
  { key: "workflows", label: "resource.workflows" },
  { key: "rules", label: "resource.rules" },
  { key: "output_styles", label: "resource.outputStyles" },
  { key: "hooks", label: "hooks.title" },
];
const TAIL_TABS: Tab[] = [
  { key: "usage", label: "usage.title" },
  { key: "settings", label: "settings.title" },
];

function tabsFor(scope: Scope): Tab[] {
  if (scope.kind === "project") {
    return [
      { key: "sessions", label: "resource.sessions" },
      ...HEAD_TABS,
      ...MIDDLE_TABS,
      { key: "memory", label: "resource.memory" },
      ...TAIL_TABS,
    ];
  }
  return [
    { key: "plugins", label: "plugins.title" },
    ...HEAD_TABS,
    ...MIDDLE_TABS,
    ...TAIL_TABS,
  ];
}

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
        create: (name) => invoke("create_workflow", { scope, name }),
        remove: deleteFile,
        namePlaceholder,
      };
  }
}

/**
 * The main area for a selected scope: resource tabs + the active panel. Tabs
 * depend on the scope (Memory is project-only; Plugins is user-only). Remounted
 * per scope (keyed in App), so the active tab resets when the scope changes.
 */
export function ResourceArea({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  const tabs = tabsFor(scope);
  const [tab, setTab] = useState<TabKey>(
    scope.kind === "project" ? "sessions" : "plugins",
  );

  return (
    <div class="flex h-full flex-col">
      <div class="flex gap-4 overflow-x-auto border-b border-neutral-200 px-6 dark:border-neutral-800">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            class={
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium transition-colors " +
              (tab === tb.key
                ? "border-accent text-accent"
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
        ) : tab === "sessions" && scope.kind === "project" ? (
          <SessionsPanel key={`${scope.id}:sessions`} projectId={scope.id} />
        ) : tab === "output_styles" ? (
          <OutputStylesPanel key={`${scope.id}:output_styles`} scope={ref} />
        ) : tab === "plugins" ? (
          <PluginsPanel key="plugins" />
        ) : tab === "skills" ? (
          <SkillsPanel
            key={`${scope.id}:skills`}
            scope={ref}
            onCreateSkill={async (name) => {
              await invoke("create_skill", { scope: ref, name });
            }}
          />
        ) : tab === "hooks" ? (
          <HooksPanel key={`${scope.id}:hooks`} scope={ref} />
        ) : tab === "mcp" ? (
          <McpPanel key={`${scope.id}:mcp`} scope={ref} />
        ) : tab === "usage" ? (
          <UsagePanel key={`${scope.id}:usage`} scope={ref} />
        ) : tab === "settings" ? (
          <SettingsPanel key={`${scope.id}:settings`} scope={scope} />
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
