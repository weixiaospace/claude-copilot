import { useEffect, useState } from "preact/hooks";
import type { LucideIcon } from "lucide-preact";
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
 * read-only kinds. `icon` is the leading card glyph; `active` adds a per-scope
 * "active selection" (output styles) — a star + "set active" action.
 */
export function ResourcePanel({
  load,
  create,
  remove,
  namePlaceholder,
  icon,
  active,
}: {
  load: () => Promise<FileResource[]>;
  create?: (name: string) => Promise<unknown>;
  remove: (resource: FileResource) => Promise<boolean>;
  namePlaceholder: string;
  icon?: LucideIcon;
  active?: { load: () => Promise<string | null>; set: (name: string) => Promise<void> };
}) {
  const [items, setItems] = useState<FileResource[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [creating, setCreating] = useState(false);
  // True only during the very first load — never re-raised on later refreshes.
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      if (active) {
        const [list, act] = await Promise.all([load(), active.load()]);
        setItems(list);
        setActiveName(act);
      } else {
        setItems(await load());
      }
    } catch (e) {
      toast.error(String(e));
    }
  }

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFsRefresh(refresh);

  async function onSetActive(name: string) {
    if (!active) return;
    try {
      await active.set(name);
      setActiveName(name);
      toast.success(t("outputStyle.activated"));
    } catch (e) {
      toast.error(String(e));
    }
  }

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
          <ResourceList
            items={items}
            emptyLabel={t("resource.empty")}
            onSelect={setSelected}
            icon={icon}
            activeName={active ? activeName : undefined}
            onSetActive={active ? onSetActive : undefined}
          />
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
