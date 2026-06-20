import { signal } from "@preact/signals";
import type { Scope } from "../types/Scope";
import { invoke } from "./ipc";

/** All scopes shown in the sidebar (User + projects). */
export const scopes = signal<Scope[]>([]);

/** The currently selected scope's id, or null before the first load. */
export const selectedScopeId = signal<string | null>(null);

/** Last error from loading scopes, surfaced in the sidebar. */
export const scopesError = signal<string | null>(null);

/** Bumped on a `resource-changed` watcher event → panels reload. */
export const fsTick = signal(0);

/** Bumped on a `providers-changed` watcher event → provider UI reloads. */
export const providersTick = signal(0);

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
  } catch (e) {
    scopesError.value = String(e);
  }
}
