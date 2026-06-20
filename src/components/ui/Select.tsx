import type { JSX } from "preact";
import { ChevronDown } from "lucide-preact";

/**
 * Native <select> with `appearance-none` + a custom chevron, so it renders
 * consistently across platforms (macOS otherwise shows its own ⇅ stepper that
 * clashes with the custom border + focus ring).
 */
export function Select({
  class: extra = "",
  children,
  ...rest
}: JSX.IntrinsicElements["select"]) {
  return (
    <div class="relative">
      <select
        class={
          "w-full appearance-none rounded-md border border-neutral-200 bg-transparent py-2 pl-3 pr-8 text-sm dark:border-neutral-700 " +
          extra
        }
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
      />
    </div>
  );
}
