import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourceList } from "./ResourceList";
import { ResourceDetail } from "./ResourceDetail";
import { Button } from "./ui/button";

export function SkillsPanel({ scope }: { scope: ScopeRef }) {
  const [items, setItems] = useState<FileResource[]>([]);
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const key = JSON.stringify(scope);

  async function refresh() {
    try {
      setItems(await invoke("list_skills", { scope }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    setSelected(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    try {
      await invoke("create_skill", { scope, name });
      setNewName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(resource: FileResource) {
    const ok = await confirm(t("detail.confirmDelete"), { kind: "warning" });
    if (!ok) return;
    await invoke("delete_skill", { path: resource.path });
    setSelected(null);
    await refresh();
  }

  return (
    <div class="flex h-full flex-col">
      <div class="flex items-center gap-2 px-6 py-3">
        <input
          class="w-56 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          placeholder={t("resource.namePlaceholder")}
          value={newName}
          onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <Button onClick={() => void create()}>{t("resource.create")}</Button>
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
        onDelete={remove}
      />
    </div>
  );
}
