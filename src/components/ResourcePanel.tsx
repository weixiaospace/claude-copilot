import { useEffect, useState } from "preact/hooks";
import type { FileResource } from "../types/FileResource";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import { t } from "../lib/i18n";
import { ResourceList } from "./ResourceList";
import { ResourceDetail } from "./ResourceDetail";
import { PanelHeader } from "./PanelHeader";
import { CreateNameDialog } from "./CreateNameDialog";
import { Loading } from "./ui/Loading";

/**
 * Generic panel for any file-backed resource kind. Behaviour is injected via
 * callbacks so the typed `invoke` stays at the call site (ResourceArea); mount
 * is keyed by scope+kind so state resets on switch. `create` is omitted for
 * read-only kinds.
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
  const [creating, setCreating] = useState(false);
  // True only during the very first load — never re-raised on later refreshes.
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setItems(await load());
    } catch (e) {
      toast.error(String(e));
    }
  }

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFsRefresh(refresh);

  async function onRemove(resource: FileResource) {
    try {
      if (await remove(resource)) {
        setSelected(null);
        await refresh();
        toast.success(t("common.deleted"));
      }
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        onRefresh={() => refresh()}
        onCreate={create ? () => setCreating(true) : undefined}
      />

      <div class="flex-1 overflow-auto px-3">
        {loading ? (
          <Loading />
        ) : (
          <ResourceList items={items} emptyLabel={t("resource.empty")} onSelect={setSelected} />
        )}
      </div>

      <ResourceDetail
        resource={selected}
        onClose={() => setSelected(null)}
        onChanged={refresh}
        onDelete={onRemove}
      />

      {create && (
        <CreateNameDialog
          open={creating}
          title={t("resource.create")}
          placeholder={namePlaceholder}
          onClose={() => setCreating(false)}
          onCreate={async (name) => {
            await create(name);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
