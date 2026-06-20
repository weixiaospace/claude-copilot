import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { X } from "lucide-preact";

/**
 * Shared modal built on the native <dialog> (ADR-0002: no Radix). Driven by an
 * `open` prop; calls `onClose` on Esc, backdrop click, or the close button.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "480px",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ComponentChildren;
  footer?: ComponentChildren;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      class="m-auto rounded-xl bg-neutral-50 p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100"
      style={{ width: `min(92vw, ${width})` }}
    >
      <div class="flex max-h-[82vh] flex-col">
        {title && (
          <header class="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
            <h2 class="text-base font-semibold">{title}</h2>
            <button
              class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </header>
        )}
        <div class="flex-1 overflow-auto p-5">{children}</div>
        {footer && (
          <footer class="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
