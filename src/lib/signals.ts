import { signal } from "@preact/signals";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import type { Profile } from "../types/Profile";
import type { ActiveProvider } from "../types/ActiveProvider";
import { invoke } from "./ipc";

/** All scopes shown in the sidebar (User + projects). */
export const scopes = signal<Scope[]>([]);

/** The currently selected scope's id, or null before the first load. */
export const selectedScopeId = signal<string | null>(null);

/** Top-level main-area view: a scope's resources, or the global Connections page. */
export const appView = signal<"scope" | "connections">("scope");

/** Last error from loading scopes, surfaced in the sidebar. */
export const scopesError = signal<string | null>(null);

/** Bumped on a `resource-changed` watcher event → panels reload. */
export const fsTick = signal(0);

/** Bumped on a `providers-changed` watcher event → provider UI reloads. */
export const providersTick = signal(0);

/** Resizable sidebar width in px (persisted to `state.json#ui.sidebarWidth`). */
export const sidebarWidth = signal<number>(240);
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 420;

/** All stored provider profiles, for resolving an active id → its name. */
export const profiles = signal<Profile[]>([]);

/** The active provider per scope id — drives the sidebar's inline 接入 label. */
export const activeByScope = signal<Record<string, ActiveProvider>>({});

const clampWidth = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

/** Load the persisted sidebar width (falls back to the default). */
export async function initSidebarWidth(): Promise<void> {
  try {
    const w = await invoke("get_sidebar_width");
    if (typeof w === "number") sidebarWidth.value = clampWidth(w);
  } catch {
    // keep default
  }
}

/** Set the sidebar width live (clamped); does not persist. */
export function setSidebarWidth(w: number): void {
  sidebarWidth.value = clampWidth(w);
}

/** Persist the current sidebar width (call on drag end). */
export async function persistSidebarWidth(): Promise<void> {
  try {
    await invoke("set_sidebar_width", { width: sidebarWidth.value });
  } catch (e) {
    console.error("set_sidebar_width failed", e);
  }
}

/** Refresh profiles + each scope's active provider in one batched round-trip. */
export async function reloadActiveProfiles(): Promise<void> {
  const list = scopes.value;
  if (list.length === 0) {
    activeByScope.value = {};
    return;
  }
  try {
    // Load profiles first: this warms the in-memory keychain cache so the
    // active-profile derivation below does not repeatedly prompt for secrets.
    const ps = await invoke("list_profiles", { input: { check_secrets: false } });
    profiles.value = ps;
    const refs: ScopeRef[] = list.map((s): ScopeRef =>
      s.kind === "user" ? { kind: "user" } : { kind: "project", id: s.id },
    );
    const results = await invoke("list_active_profiles", { scopes: refs });
    const map: Record<string, ActiveProvider> = {};
    list.forEach((s, i) => {
      if (results[i]) map[s.id] = results[i];
    });
    activeByScope.value = map;
  } catch (e) {
    console.error("list_active_profiles failed", e);
  }
}

/**
 * Refresh the scope list. Pass `next` (the list a mutating command already
 * returned) to skip a second round-trip. Keeps the selection valid, falling
 * back to the first scope when the selected one disappears.
 */
export async function reloadScopes(next?: Scope[]): Promise<void> {
  try {
    const list = next ?? (await invoke("list_scopes"));
    scopes.value = list;
    scopesError.value = null;
    const current = selectedScopeId.value;
    if (!current || !list.some((s) => s.id === current)) {
      selectedScopeId.value = list[0]?.id ?? null;
    }
    void reloadActiveProfiles();
  } catch (e) {
    scopesError.value = String(e);
  }
}
