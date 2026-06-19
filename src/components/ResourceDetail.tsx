import { useEffect, useRef, useState } from "preact/hooks";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { renderMarkdown } from "../lib/markdown";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

/**
 * Modal detail for a file-backed resource: sanitized markdown preview, "Open in
 * editor", a foldable quick-edit textarea, and optional delete. Uses the native
 * `<dialog>` element (no portal).
 */
export function ResourceDetail({
  resource,
  onClose,
  onChanged,
  onDelete,
}: {
  resource: FileResource | null;
  onClose: () => void;
  onChanged?: () => void;
  onDelete?: (resource: FileResource) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (resource) {
      setEditing(false);
      invoke("read_file", { path: resource.path })
        .then((c) => {
          setContent(c);
          setDraft(c);
        })
        .catch((e) => setContent(String(e)));
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [resource?.path]);

  async function save() {
    if (!resource) return;
    await invoke("write_file", { path: resource.path, content: draft });
    setContent(draft);
    setEditing(false);
    onChanged?.();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      class="m-auto w-[min(90vw,720px)] rounded-lg bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {resource && (
        <div class="flex max-h-[80vh] flex-col">
          <header class="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 class="truncate text-sm font-semibold">{resource.name}</h2>
            <button
              class="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
              onClick={() => ref.current?.close()}
            >
              ✕
            </button>
          </header>

          <div class="flex-1 overflow-auto p-4">
            {editing ? (
              <textarea
                class="h-72 w-full resize-y rounded border border-neutral-200 bg-transparent p-2 font-mono text-xs dark:border-neutral-700"
                value={draft}
                onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
              />
            ) : (
              <div
                class="text-sm leading-relaxed [&_a]:text-blue-600 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-neutral-100 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_code]:bg-neutral-800 dark:[&_pre]:bg-neutral-800"
                // Sanitized in renderMarkdown (DOMPurify); see CLAUDE.md.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            )}
          </div>

          <footer class="flex items-center gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <Button onClick={() => void invoke("open_in_editor", { path: resource.path })}>
              {t("detail.openInEditor")}
            </Button>
            {editing ? (
              <Button onClick={() => void save()}>{t("detail.save")}</Button>
            ) : (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                {t("detail.quickEdit")}
              </Button>
            )}
            <div class="flex-1" />
            {onDelete && (
              <Button variant="ghost" class="text-red-500" onClick={() => onDelete(resource)}>
                {t("detail.delete")}
              </Button>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}
