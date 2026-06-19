import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { ScopeRef } from "../types/ScopeRef";
import type { McpServer } from "../types/McpServer";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

type Group = { source: string; servers: McpServer[] };

function groupBySource(servers: McpServer[]): Group[] {
  const groups: Group[] = [];
  for (const s of servers) {
    let g = groups.find((g) => g.source === s.source);
    if (!g) {
      g = { source: s.source, servers: [] };
      groups.push(g);
    }
    g.servers.push(s);
  }
  return groups;
}

/** MCP servers for a scope, grouped by source. Reads parse JSON directly;
 *  add/remove go through the `claude mcp` CLI. */
export function McpPanel({ scope }: { scope: ScopeRef }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [transport, setTransport] = useState("stdio");

  const key = JSON.stringify(scope);

  async function refresh() {
    try {
      setServers(await invoke("list_mcp", { scope }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function add() {
    if (!name.trim() || !target.trim()) return;
    try {
      await invoke("add_mcp", { scope, name: name.trim(), transport, target: target.trim() });
      setName("");
      setTarget("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(s: McpServer) {
    if (!(await confirm(t("mcp.confirmRemove"), { kind: "warning" }))) return;
    try {
      await invoke("remove_mcp", { scope, name: s.name, source: s.source });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  const groups = groupBySource(servers);

  return (
    <div class="flex h-full flex-col">
      <div class="flex flex-wrap items-center gap-2 px-6 py-3">
        <input
          class="w-40 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          placeholder={t("mcp.namePlaceholder")}
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <select
          class="rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          value={transport}
          onChange={(e) => setTransport((e.target as HTMLSelectElement).value)}
        >
          <option value="stdio">stdio</option>
          <option value="sse">sse</option>
          <option value="http">http</option>
        </select>
        <input
          class="min-w-0 flex-1 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          placeholder={t("mcp.targetPlaceholder")}
          value={target}
          onInput={(e) => setTarget((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <Button onClick={() => void add()}>{t("resource.create")}</Button>
        <Button variant="ghost" onClick={() => void refresh()}>
          {t("resource.refresh")}
        </Button>
      </div>

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}

      <div class="flex-1 overflow-auto px-6 pb-3">
        {!error && servers.length === 0 && (
          <div class="py-6 text-sm text-neutral-400">{t("mcp.empty")}</div>
        )}
        {groups.map((g) => (
          <section key={g.source} class="mb-4">
            <header class="mb-1">
              <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
                {t(`mcp.source.${g.source}`)}
              </span>
            </header>
            <ul class="flex flex-col gap-1">
              {g.servers.map((s) => (
                <li
                  key={s.name}
                  class="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
                >
                  <span class="font-medium">{s.name}</span>
                  <span class="rounded bg-neutral-100 px-1 text-xs text-neutral-500 dark:bg-neutral-800">
                    {s.transport}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-xs text-neutral-400" title={s.url ?? s.command ?? ""}>
                    {s.url ?? s.command ?? ""}
                  </span>
                  <button
                    class="shrink-0 text-xs text-neutral-400 hover:text-red-500"
                    title={t("mcp.remove")}
                    aria-label={t("mcp.remove")}
                    onClick={() => void remove(s)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
