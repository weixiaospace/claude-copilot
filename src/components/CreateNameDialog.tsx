import { useState } from "preact/hooks";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/button";
import { t } from "../lib/i18n";
import { toast } from "../lib/toast";

/** Shared name-only create dialog (skills/agents/rules/workflows/output/memory). */
export function CreateNameDialog({
  open,
  title,
  placeholder,
  onClose,
  onCreate,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setName("");
    setSubmitting(false);
    onClose();
  }

  async function submit() {
    const n = name.trim();
    if (!n || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(n);
      close();
    } catch (e) {
      toast.error(String(e));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("providers.cancel")}
          </Button>
          <Button disabled={!name.trim() || submitting} onClick={() => void submit()}>
            {t("resource.create")}
          </Button>
        </>
      }
    >
      <input
        autofocus
        class="w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
        placeholder={placeholder}
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
    </Modal>
  );
}
