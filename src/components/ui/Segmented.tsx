import type { ComponentChildren } from "preact";

/** Shared pill segmented control (theme / locale / usage granularity / settings
 *  layers). One consistent look for every "pick one of N" toggle. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ComponentChildren; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm dark:border-neutral-800">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          aria-label={o.title}
          class={
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 leading-none transition-colors " +
            (value === o.value
              ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")
          }
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
