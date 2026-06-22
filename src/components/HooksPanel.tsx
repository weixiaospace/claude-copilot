import { useEffect, useState } from "preact/hooks";
import type { ScopeRef } from "../types/ScopeRef";
import type { HookEntry } from "../types/HookEntry";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { notifyError } from "../lib/notify";
import { useFsRefresh } from "../lib/useFsRefresh";
import { PanelHeader } from "./PanelHeader";

type Group = { source: string; path: string | null; entries: HookEntry[] };

/** Group entries by (source, file) while preserving backend order. */
function groupBySource(entries: HookEntry[]): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    let g = groups.find((g) => g.source === e.source && g.path === e.source_path);
    if (!g) {
      g = { source: e.source, path: e.source_path, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

/** Read-only merged view of hooks for a scope, grouped by source file. */
export function HooksPanel({ scope }: { scope: ScopeRef }) {
  const [entries, setEntries] = useState<HookEntry[]>([]);

  async function refresh() {
    try {
      setEntries(await invoke("list_hooks", { scope }));
    } catch (e) {
      await notifyError(e);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope)]);
  useFsRefresh(refresh);

  const groups = groupBySource(entries);

  return (
    <div class="flex h-full flex-col">
      <PanelHeader onRefresh={() => void refresh()} />
      <div class="min-h-0 flex-1 overflow-auto px-6 pb-3">
        {groups.length === 0 && (
          <div class="py-6 text-sm text-neutral-400">{t("hooks.empty")}</div>
        )}
        {groups.map((g) => (
        <section key={(g.path ?? "") + g.source} class="mb-4">
          <header class="mb-1 flex items-center gap-2">
            <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
              {t(`hooks.source.${g.source}`)}
            </span>
            {g.path && (
              <span class="min-w-0 flex-1 truncate text-xs text-neutral-400" title={g.path}>
                {g.path}
              </span>
            )}
            {g.path && (
              <button
                class="shrink-0 text-xs text-accent hover:underline"
                onClick={() => void invoke("open_in_editor", { path: g.path! })}
              >
                {t("hooks.openFile")}
              </button>
            )}
          </header>
          <ul class="flex flex-col gap-1">
            {g.entries.map((e, i) => (
              <li
                key={i}
                class="rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <div class="flex items-center gap-2">
                  <span class="font-medium">{e.event}</span>
                  {e.matcher && <span class="text-xs text-neutral-500">· {e.matcher}</span>}
                </div>
                <code class="mt-1 block overflow-x-auto whitespace-pre rounded bg-neutral-50 px-2 py-1 text-xs dark:bg-neutral-900">
                  {e.command}
                </code>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}
