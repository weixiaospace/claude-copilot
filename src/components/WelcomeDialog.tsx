import { useEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

/** First-run welcome, shown once. Explains the provider model (ADR-0001). */
export function WelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      class="m-auto w-[min(90vw,520px)] rounded-lg bg-neutral-50 p-0 text-neutral-900 backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div class="flex flex-col gap-4 p-6">
        <h2 class="text-base font-semibold">{t("welcome.title")}</h2>
        <p class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {t("welcome.body")}
        </p>
        <div class="flex justify-end">
          <Button onClick={() => ref.current?.close()}>{t("welcome.dismiss")}</Button>
        </div>
      </div>
    </dialog>
  );
}
