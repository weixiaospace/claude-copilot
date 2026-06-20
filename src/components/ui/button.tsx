import type { ComponentChildren, JSX } from "preact";

type Variant = "default" | "ghost" | "active";

const base =
  "inline-flex items-center text-left rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  default: "bg-accent text-white hover:bg-accent-hover",
  ghost:
    "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
  active: "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white",
};

interface ButtonProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, "class"> {
  variant?: Variant;
  /** Extra classes merged after the variant's. */
  class?: string;
  disabled?: boolean;
  children?: ComponentChildren;
}

export function Button({
  variant = "default",
  class: extra = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button class={`${base} ${variants[variant]} ${extra}`} {...props}>
      {children}
    </button>
  );
}
