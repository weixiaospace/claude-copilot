import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { FileResource } from "../types/FileResource";
import type { MemoryInfo } from "../types/MemoryInfo";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourceList } from "./ResourceList";
import { ResourceDetail } from "./ResourceDetail";
import { PanelHeader } from "./PanelHeader";
import { CreateNameDialog } from "./CreateNameDialog";

/** Project auto-memory: list/create/delete markdown files in the resolved dir. */
export function MemoryPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<FileResource[]>([]);
  const [info, setInfo] = useState<MemoryInfo | null>(null);
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const [list, mi] = await Promise.all([
        invoke("list_memories", { projectId }),
        invoke("memory_info", { projectId }),
      ]);
      setItems(list);
      setInfo(mi);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    setSelected(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function remove(resource: FileResource) {
    const ok = await confirm(t("memory.confirmDelete"), { kind: "warning" });
    if (!ok) return;
    await invoke("delete_memory", { projectId, path: resource.path });
    setSelected(null);
    await refresh();
  }

  return (
    <div class="flex h-full flex-col">
      <PanelHeader onRefresh={() => void refresh()} onCreate={() => setCreating(true)} />

      {info && (
        <div class="px-6 pb-2 text-xs text-neutral-400">
          <div>
            {t("memory.location")}: <span class="font-mono">{info.effective}</span>
          </div>
          {info.overridden && (
            <div class="text-amber-500">
              {t("memory.overridden")} —{" "}
              <span class="font-mono">{info.default}</span>
            </div>
          )}
        </div>
      )}

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}

      <div class="flex-1 overflow-auto px-3">
        <ResourceList items={items} emptyLabel={t("memory.empty")} onSelect={setSelected} />
      </div>

      <ResourceDetail
        resource={selected}
        onClose={() => setSelected(null)}
        onChanged={refresh}
        onDelete={remove}
      />

      <CreateNameDialog
        open={creating}
        title={t("resource.create")}
        placeholder={t("memory.namePlaceholder")}
        onClose={() => setCreating(false)}
        onCreate={async (name) => {
          await invoke("create_memory", { projectId, name });
          await refresh();
        }}
      />
    </div>
  );
}
