import { signal } from "@preact/signals";

/** Visual/severity kind of a toast. `loading` is sticky until resolved. */
export type ToastKind = "success" | "error" | "loading";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Active toasts, oldest first. Read in <Toaster/> to render the stack. */
export const toasts = signal<Toast[]>([]);

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** Auto-dismiss delay per kind; `null` keeps the toast until explicitly resolved. */
const AUTO_DISMISS: Record<ToastKind, number | null> = {
  success: 2800,
  error: 5200,
  loading: null,
};

function clearTimer(id: number): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

function scheduleDismiss(id: number, kind: ToastKind): void {
  clearTimer(id);
  const ms = AUTO_DISMISS[kind];
  if (ms !== null) timers.set(id, setTimeout(() => dismiss(id), ms));
}

/** Remove a toast immediately (also fired by its close button). */
export function dismiss(id: number): void {
  clearTimer(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function push(kind: ToastKind, message: string): number {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, kind, message }];
  scheduleDismiss(id, kind);
  return id;
}

/** Mutate an existing toast in place (e.g. loading → success); reschedules its timer. */
function update(id: number, kind: ToastKind, message: string): void {
  let found = false;
  toasts.value = toasts.value.map((t) => {
    if (t.id !== id) return t;
    found = true;
    return { ...t, kind, message };
  });
  // If it was already auto-dismissed, surface the result as a fresh toast.
  if (found) scheduleDismiss(id, kind);
  else push(kind, message);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  loading: (message: string) => push("loading", message),
  dismiss,
  /**
   * Drive a promise through one toast: `loading` while pending, then
   * `success`/`error`. Re-throws so callers can still branch on failure.
   * `error` may be a string or a mapper over the thrown value.
   */
  async promise<T>(
    work: Promise<T>,
    msgs: { loading: string; success: string; error: string | ((e: unknown) => string) },
  ): Promise<T> {
    const id = push("loading", msgs.loading);
    try {
      const result = await work;
      update(id, "success", msgs.success);
      return result;
    } catch (e) {
      update(id, "error", typeof msgs.error === "function" ? msgs.error(e) : msgs.error);
      throw e;
    }
  },
};
