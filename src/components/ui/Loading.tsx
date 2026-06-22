import { Loader2 } from "lucide-preact";
import { t } from "../../lib/i18n";

/**
 * Centered spinner + label for a panel's initial data load. Render this while a
 * panel is fetching and has nothing to show yet, so a slow load reads as
 * "working" instead of "empty".
 */
export function Loading({ label }: { label?: string }) {
  return (
    <div class="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
      <Loader2 size={16} class="animate-spin" />
      {label ?? t("common.loading")}
    </div>
  );
}
