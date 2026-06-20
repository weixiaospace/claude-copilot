import type { ComponentChildren } from "preact";
import { Plus, RefreshCw } from "lucide-preact";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

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
  onRefresh?: () => void;
  createLabel?: string;
  onCreate?: () => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2 px-6 py-3">
      {title && <h2 class="text-base font-semibold">{title}</h2>}
      {extra}
      <div class="ml-auto flex items-center gap-2">
        {actions}
        {onCreate && (
          <Button onClick={onCreate}>
            <Plus size={16} class="mr-1" />
            {createLabel ?? t("resource.create")}
          </Button>
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            onClick={onRefresh}
            title={t("resource.refresh")}
            aria-label={t("resource.refresh")}
          >
            <RefreshCw size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
