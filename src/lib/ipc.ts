import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import type { HookEntry } from "../types/HookEntry";
import type { McpServer } from "../types/McpServer";
import type { McpSource } from "../types/McpSource";
import type { MemoryInfo } from "../types/MemoryInfo";
import type { InstalledPlugin } from "../types/InstalledPlugin";
import type { Marketplace } from "../types/Marketplace";
import type { AvailablePlugin } from "../types/AvailablePlugin";
import type { BundledResource } from "../types/BundledResource";
import type { Profile } from "../types/Profile";
import type { ProfileInput } from "../types/ProfileInput";
import type { ActiveProvider } from "../types/ActiveProvider";
import type { AuthStatus } from "../types/AuthStatus";
import type { UsageResult } from "../types/UsageResult";
import type { Session } from "../types/Session";

/**
 * Typed map of every IPC command: its argument shape and result.
 *
 * Errors surface as **rejected promises** (the throwing convention) — call
 * sites use try/catch, there is no `{ ok, error }` envelope. Extend this map as
 * commands are added.
 */
export interface Commands {
  list_scopes: { args: void; result: Scope[] };
  add_project: { args: { path: string }; result: Scope[] };
  remove_manual_project: { args: { id: string }; result: Scope[] };
  get_locale: { args: void; result: string | null };
  set_locale: { args: { locale: string }; result: void };
  get_theme: { args: void; result: string | null };
  set_theme: { args: { theme: string }; result: void };
  get_sidebar_width: { args: void; result: number | null };
  set_sidebar_width: { args: { width: number }; result: void };
  get_welcome_seen: { args: void; result: boolean };
  mark_welcome_seen: { args: void; result: void };
  list_skills: { args: { scope: ScopeRef }; result: FileResource[] };
  create_skill: { args: { scope: ScopeRef; name: string }; result: FileResource };
  delete_skill: { args: { path: string }; result: void };
  list_agents: { args: { scope: ScopeRef }; result: FileResource[] };
  create_agent: { args: { scope: ScopeRef; name: string }; result: FileResource };
  list_rules: { args: { scope: ScopeRef }; result: FileResource[] };
  create_rule: { args: { scope: ScopeRef; name: string }; result: FileResource };
  list_workflows: { args: { scope: ScopeRef }; result: FileResource[] };
  create_workflow: { args: { scope: ScopeRef; name: string }; result: FileResource };
  delete_resource: { args: { path: string }; result: void };
  list_output_styles: { args: { scope: ScopeRef }; result: FileResource[] };
  create_output_style: { args: { scope: ScopeRef; name: string }; result: FileResource };
  get_active_output_style: { args: { scope: ScopeRef }; result: string | null };
  set_active_output_style: { args: { scope: ScopeRef; name: string }; result: void };
  read_file: { args: { path: string }; result: string };
  write_file: { args: { path: string; content: string }; result: void };
  open_in_editor: { args: { path: string }; result: void };
  list_hooks: { args: { scope: ScopeRef }; result: HookEntry[] };
  list_mcp: { args: { scope: ScopeRef }; result: McpServer[] };
  add_mcp: {
    args: { scope: ScopeRef; name: string; transport: string; target: string };
    result: void;
  };
  remove_mcp: { args: { scope: ScopeRef; name: string; source: McpSource }; result: void };
  memory_info: { args: { projectId: string }; result: MemoryInfo };
  list_memories: { args: { projectId: string }; result: FileResource[] };
  create_memory: { args: { projectId: string; name: string }; result: FileResource };
  delete_memory: { args: { projectId: string; path: string }; result: void };
  list_plugins: { args: void; result: InstalledPlugin[] };
  list_marketplaces: { args: void; result: Marketplace[] };
  list_available_plugins: { args: void; result: AvailablePlugin[] };
  list_bundled_resources: { args: { installPath: string }; result: BundledResource[] };
  install_plugin: { args: { name: string }; result: void };
  uninstall_plugin: { args: { name: string }; result: void };
  toggle_plugin: { args: { name: string; enable: boolean }; result: void };
  add_marketplace: { args: { source: string }; result: void };
  remove_marketplace: { args: { name: string }; result: void };
  update_marketplace: { args: { name: string | null }; result: void };
  list_profiles: { args: { input: { check_secrets?: boolean } }; result: Profile[] };
  create_profile: { args: { input: ProfileInput; secret: string | null }; result: Profile };
  update_profile: {
    args: { id: string; input: ProfileInput; secret: string | null };
    result: Profile;
  };
  delete_profile: { args: { id: string }; result: void };
  activate_profile: { args: { id: string; scope: ScopeRef }; result: ActiveProvider };
  deactivate_provider: { args: { scope: ScopeRef }; result: ActiveProvider };
  get_active_profile: { args: { scope: ScopeRef }; result: ActiveProvider };
  list_active_profiles: { args: { scopes: ScopeRef[] }; result: ActiveProvider[] };
  get_claude_auth_status: { args: void; result: AuthStatus };
  open_claude_login: { args: void; result: void };
  query_usage: {
    args: { scope: ScopeRef; granularity: "day" | "week" | "month" };
    result: UsageResult;
  };
  read_settings: {
    args: { scope: ScopeRef; layer: string };
    result: Record<string, unknown>;
  };
  write_settings: {
    args: { scope: ScopeRef; layer: string; value: Record<string, unknown> };
    result: void;
  };
  list_sessions: { args: { projectId: string }; result: Session[] };
  open_terminal: {
    args: { projectId: string; tool: string; sessionId: string | null };
    result: void;
  };
  open_in_app: { args: { projectId: string; app: string }; result: void };
}

export function invoke<K extends keyof Commands>(
  cmd: K,
  ...rest: Commands[K]["args"] extends void ? [] : [Commands[K]["args"]]
): Promise<Commands[K]["result"]> {
  return tauriInvoke<Commands[K]["result"]>(
    cmd,
    rest[0] as unknown as Record<string, unknown> | undefined,
  );
}

/** Subscribe to a backend event; resolves with an unlisten function. */
export function listen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return tauriListen<T>(event, (e) => handler(e.payload));
}
