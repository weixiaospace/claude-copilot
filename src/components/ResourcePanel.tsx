import { useEffect, useState } from "preact/hooks";
import type { FileResource } from "../types/FileResource";
import { t } from "../lib/i18n";
import { ResourceList } from "./ResourceList";
import { ResourceDetail } from "./ResourceDetail";
import { Button } from "./ui/button";

/**
 * Generic panel for any file-backed resource kind. Behaviour is injected via
 * callbacks so the typed `invoke` stays at the call site (ResourceArea); mount
 * is keyed by scope+kind so state resets on switch. `create` is omitted for
 * read-mostly kinds (e.g. Workflows).
 */
export function ResourcePanel({
  load,
  create,
  remove,
  namePlaceholder,
}: {
  load: () => Promise<FileResource[]>;
  create?: (name: string) => Promise<unknown>;
  remove: (resource: FileResource) => Promise<boolean>;
  namePlaceholder: string;
}) {
  const [items, setItems] = useState<FileResource[]>([]);
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function refresh() {
    try {
      setItems(await load());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate() {
    if (!create) return;
    const name = newName.trim();
    if (!name) return;
    try {
      await create(name);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRemove(resource: FileResource) {
    try {
      if (await remove(resource)) {
        setSelected(null);
        await refresh();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div class="flex h-full flex-col">
      <div class="flex items-center gap-2 px-6 py-3">
        {create && (
          <>
            <input
              class="w-56 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
              placeholder={namePlaceholder}
              value={newName}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
            />
            <Button onClick={() => void onCreate()}>{t("resource.create")}</Button>
          </>
        )}
        <Button variant="ghost" onClick={() => void refresh()}>
          {t("resource.refresh")}
        </Button>
      </div>

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}

      <div class="flex-1 overflow-auto px-3">
        <ResourceList items={items} emptyLabel={t("resource.empty")} onSelect={setSelected} />
      </div>

      <ResourceDetail
        resource={selected}
        onClose={() => setSelected(null)}
        onChanged={refresh}
        onDelete={onRemove}
      />
    </div>
  );
}
