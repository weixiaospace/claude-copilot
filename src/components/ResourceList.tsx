import type { FileResource } from "../types/FileResource";

/** Flat list of file-backed resources (name + description), click to open. */
export function ResourceList({
  items,
  emptyLabel,
  onSelect,
}: {
  items: FileResource[];
  emptyLabel: string;
  onSelect: (resource: FileResource) => void;
}) {
  if (items.length === 0) {
    return <div class="px-3 py-6 text-sm text-neutral-400">{emptyLabel}</div>;
  }
  return (
    <ul class="flex flex-col gap-0.5 py-2">
      {items.map((r) => (
        <li key={r.path}>
          <button
            class="w-full rounded-md px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => onSelect(r)}
          >
            <div class="text-sm font-medium">{r.name}</div>
            {r.description && (
              <div class="truncate text-xs text-neutral-500">{r.description}</div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
