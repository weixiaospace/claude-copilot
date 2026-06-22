import { Star, type LucideIcon } from "lucide-preact";
import type { FileResource } from "../types/FileResource";
import { t } from "../lib/i18n";

// Matches the Plugins/Skills/MCP card language for one consistent look.
const card =
  "rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700";

/**
 * Card list of file-backed resources (icon + name + description), click to open.
 * Pass `activeName` + `onSetActive` for kinds that have an active selection
 * (output styles): the active item shows a star, the rest a "set active" action.
 */
export function ResourceList({
  items,
  emptyLabel,
  onSelect,
  icon: Icon,
  activeName,
  onSetActive,
}: {
  items: FileResource[];
  emptyLabel: string;
  onSelect: (resource: FileResource) => void;
  icon?: LucideIcon;
  activeName?: string | null;
  onSetActive?: (name: string) => void;
}) {
  if (items.length === 0) {
    return <div class="py-8 text-sm text-neutral-400">{emptyLabel}</div>;
  }
  return (
    <ul class="flex flex-col gap-2 py-2">
      {items.map((r) => {
        const isActive = activeName === r.name;
        return (
          <li key={r.path} class={card}>
            <div class="flex items-center gap-2">
              {Icon && <Icon size={16} class="shrink-0 text-neutral-400" />}
              <button
                class="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-accent"
                onClick={() => onSelect(r)}
                title={r.name}
              >
                {r.name}
              </button>
              {onSetActive &&
                (isActive ? (
                  <span class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                    <Star size={13} class="fill-accent text-accent" />
                    {t("outputStyle.active")}
                  </span>
                ) : (
                  <button
                    class="shrink-0 text-xs text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-white"
                    onClick={() => onSetActive(r.name)}
                  >
                    {t("outputStyle.setActive")}
                  </button>
                ))}
            </div>
            {r.description && (
              <p class="mt-1 line-clamp-2 pl-6 text-xs text-neutral-500" title={r.description}>
                {r.description}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
