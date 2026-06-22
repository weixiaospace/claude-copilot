import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Plus, RefreshCw } from "lucide-preact";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

/** Floor for the refresh spin so even an instant refresh visibly registers. */
const MIN_SPIN_MS = 450;

/**
 * Unified toolbar for every panel: optional title + panel-specific `extra`
 * controls on the left, a primary "create" action and a refresh on the right.
 */
export function PanelHeader({
  title,
  extra,
  actions,
  onRefresh,
  createLabel,
  onCreate,
}: {
  title?: string;
  extra?: ComponentChildren;
  /** Arbitrary right-aligned controls (e.g. Save), shown before create/refresh. */
  actions?: ComponentChildren;
  /** Return a promise to spin the button until the refresh actually finishes. */
  onRefresh?: () => void | Promise<unknown>;
  createLabel?: string;
  onCreate?: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    const start = Date.now();
    try {
      await onRefresh();
    } catch {
      // The panel surfaces its own errors; just stop spinning.
    } finally {
      const rest = MIN_SPIN_MS - (Date.now() - start);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      setRefreshing(false);
    }
  }

  return (
    <div class="flex flex-wrap items-center gap-2 px-6 py-3">
      {title && <h2 class="text-base font-semibold">{title}</h2>}
      {extra}
      <div class="ml-auto flex items-center gap-2">
        {actions}
        {onCreate && (
          <Button onClick={onCreate} title={createLabel ?? t("resource.create")}>
            <Plus size={16} class="mr-1" />
            {createLabel ?? t("resource.create")}
          </Button>
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            title={t("resource.refresh")}
            aria-label={t("resource.refresh")}
          >
            <RefreshCw size={16} class={refreshing ? "animate-spin" : ""} />
          </Button>
        )}
      </div>
    </div>
  );
}
