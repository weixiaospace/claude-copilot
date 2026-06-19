import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Scope } from "../types/Scope";

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
