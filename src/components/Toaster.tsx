import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-preact";
import { dismiss, toasts, type ToastKind } from "../lib/toast";

const ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  loading: Loader2,
};

/** Accent colour for the leading icon, by kind. */
function iconClass(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return "text-emerald-500";
    case "error":
      return "text-red-500";
    case "loading":
      return "animate-spin text-accent";
  }
}

/**
 * Non-blocking toast stack, mounted once at the app root. Replaces blocking
 * native dialogs for transient success/failure feedback (errors that need a
 * decision still use a modal). Bottom-right, newest at the bottom.
 */
export function Toaster() {
  return (
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.value.map((toast) => {
        const Icon = ICON[toast.kind];
        return (
          <div
            key={toast.id}
            class="animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            <Icon size={16} class={"mt-0.5 shrink-0 " + iconClass(toast.kind)} />
            <span class="min-w-0 flex-1 break-words text-sm text-neutral-800 dark:text-neutral-100">
              {toast.message}
            </span>
            {toast.kind !== "loading" && (
              <button
                class="-mr-1 shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                onClick={() => dismiss(toast.id)}
                aria-label="dismiss"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
