import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

/** Shared pill segmented control (theme / locale / usage granularity / settings
 *  layers). One consistent look for every "pick one of N" toggle. Exposed as an
 *  ARIA radiogroup with roving tabindex + ←/→ (and ↑/↓) keyboard selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ComponentChildren; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);

  function move(dir: number) {
    if (options.length === 0) return;
    const next = (idx + dir + options.length) % options.length;
    onChange(options[next].value);
    btns.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      class="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm dark:border-neutral-800"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              btns.current[i] = el;
            }}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title}
            aria-label={o.title}
            class={
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 leading-none transition-colors " +
              (active
                ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")
            }
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
