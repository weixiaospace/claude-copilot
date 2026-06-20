import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Star } from "lucide-preact";
import type { ScopeRef } from "../types/ScopeRef";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { ResourceDetail } from "./ResourceDetail";
import { PanelHeader } from "./PanelHeader";
import { CreateNameDialog } from "./CreateNameDialog";

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
  const [creating, setCreating] = useState(false);

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
      <PanelHeader onRefresh={() => void refresh()} onCreate={() => setCreating(true)} />

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
                        <Star
                          size={14}
                          class="fill-accent text-accent"
                          aria-label={t("outputStyle.active")}
                        />
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

      <CreateNameDialog
        open={creating}
        title={t("resource.create")}
        placeholder={t("resource.namePlaceholder")}
        onClose={() => setCreating(false)}
        onCreate={async (name) => {
          await invoke("create_output_style", { scope, name });
          await refresh();
        }}
      />
    </div>
  );
}
