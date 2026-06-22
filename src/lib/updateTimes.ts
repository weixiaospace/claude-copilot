import { signal } from "@preact/signals";

/**
 * Tracks when the user last successfully updated a marketplace or skill source
 * *from the app*, so each card can show a "last updated" label. Persisted to
 * localStorage (per-machine, like the panel's tab/scroll state) — the backend
 * update commands return no timestamp, and the marketplace list lives in a
 * CLI-owned file we don't extend. Keyed by `${kind}:${name}`.
 */
export type UpdateKind = "marketplace" | "source";

const KEY = "cc:market-updated-at";

function load(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const updatedAt = signal<Record<string, number>>(load());

/**
 * A coarse, app-wide clock that ticks every minute. Components that render
 * relative times read `nowMs.value` so their labels age ("just now" → "2 min
 * ago") without any interaction.
 */
export const nowMs = signal(Date.now());
setInterval(() => {
  nowMs.value = Date.now();
}, 60_000);

const keyOf = (kind: UpdateKind, name: string) => `${kind}:${name}`;

/** Record a successful update (defaults to now); re-renders any showing card. */
export function recordUpdated(kind: UpdateKind, name: string, at: number = Date.now()): void {
  const next = { ...updatedAt.value, [keyOf(kind, name)]: at };
  updatedAt.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best-effort; the label simply won't persist across restarts
  }
}

/** Epoch ms of the last recorded update, or undefined if never updated here. */
export function lastUpdated(kind: UpdateKind, name: string): number | undefined {
  return updatedAt.value[keyOf(kind, name)];
}
