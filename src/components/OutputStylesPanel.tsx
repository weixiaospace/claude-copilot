import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourceDetail } from "./ResourceDetail";
import { Button } from "./ui/button";

/**
 * Output Styles: a file-backed resource (like the others) plus a per-scope
 * **active** selection. The active style is marked with a star; "Set active"
 * writes it to the scope's settings (User → settings.json, Project →
 * settings.local.json) via the backend.
 */
export function OutputStylesPanel({ scope }: { scope: ScopeRef }) {
  const [items, setItems] = useState<FileResource[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function refresh() {
    try {
      const [list, act] = await Promise.all([
        invoke("list_output_styles", { scope }),
        invoke("get_active_output_style", { scope }),
      ]);
      setItems(list);
      setActive(act);
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
    const name = newName.trim();
    if (!name) return;
    try {
      await invoke("create_output_style", { scope, name });
      setNewName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function setActiveStyle(name: string) {
    try {
      await invoke("set_active_output_style", { scope, name });
      setActive(name);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRemove(resource: FileResource): Promise<boolean> {
    if (!(await confirm(t("detail.confirmDelete"), { kind: "warning" }))) return false;
    await invoke("delete_resource", { path: resource.path });
    setSelected(null);
    await refresh();
    return true;
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
            if (e.key === "Enter") void onCreate();
          }}
        />
        <Button onClick={() => void onCreate()}>{t("resource.create")}</Button>
        <Button variant="ghost" onClick={() => void refresh()}>
          {t("resource.refresh")}
        </Button>
      </div>

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}

      <div class="flex-1 overflow-auto px-3">
        {items.length === 0 ? (
          <div class="px-3 py-6 text-sm text-neutral-400">{t("resource.empty")}</div>
        ) : (
          <ul class="flex flex-col gap-0.5 py-2">
            {items.map((r) => {
              const isActive = active === r.name;
              return (
                <li key={r.path} class="group flex items-center gap-1">
                  <button
                    class="flex-1 rounded-md px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => setSelected(r)}
                  >
                    <div class="flex items-center gap-2 text-sm font-medium">
                      {isActive && (
                        <span class="text-amber-500" title={t("outputStyle.active")}>
                          ★
                        </span>
                      )}
                      {r.name}
                    </div>
                    {r.description && (
                      <div class="truncate text-xs text-neutral-500">{r.description}</div>
                    )}
                  </button>
                  {!isActive && (
                    <button
                      class="shrink-0 px-2 text-xs text-neutral-400 opacity-0 transition-opacity hover:text-neutral-900 group-hover:opacity-100 dark:hover:text-white"
                      onClick={() => void setActiveStyle(r.name)}
                    >
                      {t("outputStyle.setActive")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
