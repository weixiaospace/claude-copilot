import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import { X } from "lucide-preact";
import type { ScopeRef } from "../types/ScopeRef";
import type { McpServer } from "../types/McpServer";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { PanelHeader } from "./PanelHeader";
import { Modal } from "./ui/Modal";
import { Select } from "./ui/Select";
import { Button } from "./ui/button";
import { Loading } from "./ui/Loading";

type Group = { source: string; servers: McpServer[] };

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

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

/** Trust badge for a project `.mcp.json` server (pending/rejected/approved). */
function ApprovalBadge({ approval }: { approval: string }) {
  const tone: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    approved: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  };
  const cls = tone[approval];
  if (!cls) return null;
  return (
    <span class={"shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + cls}>
      {t(`mcp.approval.${approval}`)}
    </span>
  );
}

const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** MCP servers for a scope, grouped by source. Reads parse JSON directly;
 *  add/remove go through the `claude mcp` CLI. */
export function McpPanel({ scope }: { scope: ScopeRef }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState("stdio");
  const [layer, setLayer] = useState("local");
  const [target, setTarget] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [saving, setSaving] = useState(false);

  const key = JSON.stringify(scope);
  const isStdio = transport === "stdio";

  async function refresh() {
    try {
      setServers(await invoke("list_mcp", { scope }));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useFsRefresh(refresh);

  function resetForm() {
    setName("");
    setTarget("");
    setArgsText("");
    setEnvText("");
    setHeadersText("");
    setTransport("stdio");
    setLayer("local");
  }

  function closeForm() {
    setCreating(false);
    resetForm();
  }

  async function add() {
    if (!name.trim() || !target.trim() || saving) return;
    setSaving(true);
    try {
      await invoke("add_mcp", {
        scope,
        layer: scope.kind === "project" ? layer : "user",
        transport,
        name: name.trim(),
        target: target.trim(),
        args: isStdio ? tokens(argsText) : [],
        // env is KEY=VALUE lines; drop anything that isn't a pair.
        env: isStdio ? lines(envText).filter((l) => l.includes("=")) : [],
        headers: isStdio ? [] : lines(headersText),
      });
      toast.success(t("mcp.added"));
      closeForm();
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: McpServer) {
    if (!(await confirm(t("mcp.confirmRemove"), { kind: "warning" }))) return;
    try {
      await invoke("remove_mcp", { scope, name: s.name, source: s.source });
      toast.success(t("mcp.removed"));
      await refresh();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const groups = groupBySource(servers);

  return (
    <div class="flex h-full flex-col">
      <PanelHeader onRefresh={() => refresh()} onCreate={() => setCreating(true)} />

      <div class="flex-1 overflow-auto px-6 pb-3">
        {loading && servers.length === 0 && <Loading />}
        {!loading && servers.length === 0 && (
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
                  {s.approval && <ApprovalBadge approval={s.approval} />}
                  <span class="min-w-0 flex-1 truncate text-xs text-neutral-400" title={s.url ?? s.command ?? ""}>
                    {s.url ?? s.command ?? ""}
                  </span>
                  <button
                    class="shrink-0 text-neutral-400 hover:text-red-500"
                    title={t("mcp.remove")}
                    aria-label={t("mcp.remove")}
                    onClick={() => void remove(s)}
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal
        open={creating}
        onClose={closeForm}
        title={t("mcp.addTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              {t("providers.cancel")}
            </Button>
            <Button onClick={() => void add()} disabled={!name.trim() || !target.trim() || saving}>
              {t("resource.create")}
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          {scope.kind === "project" && (
            <label class="flex flex-col gap-1 text-xs text-neutral-500">
              {t("mcp.layer")}
              <Select value={layer} onChange={(e) => setLayer((e.target as HTMLSelectElement).value)}>
                <option value="local">{t("mcp.layerLocal")}</option>
                <option value="project">{t("mcp.layerProject")}</option>
              </Select>
              <span class="text-xs text-neutral-400">{t("mcp.layerHint")}</span>
            </label>
          )}

          <label class="flex flex-col gap-1 text-xs text-neutral-500">
            {t("mcp.namePlaceholder")}
            <input
              autofocus
              class={inputClass}
              placeholder={t("mcp.namePlaceholder")}
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="flex flex-col gap-1 text-xs text-neutral-500">
            {t("mcp.transport")}
            <Select
              value={transport}
              onChange={(e) => setTransport((e.target as HTMLSelectElement).value)}
            >
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
              <option value="http">http</option>
            </Select>
          </label>

          <label class="flex flex-col gap-1 text-xs text-neutral-500">
            {isStdio ? t("mcp.command") : t("mcp.url")}
            <input
              class={inputClass}
              placeholder={isStdio ? t("mcp.commandPlaceholder") : t("mcp.urlPlaceholder")}
              value={target}
              onInput={(e) => setTarget((e.target as HTMLInputElement).value)}
            />
          </label>

          {isStdio ? (
            <>
              <label class="flex flex-col gap-1 text-xs text-neutral-500">
                {t("mcp.args")}
                <input
                  class={inputClass}
                  placeholder={t("mcp.argsPlaceholder")}
                  value={argsText}
                  onInput={(e) => setArgsText((e.target as HTMLInputElement).value)}
                />
              </label>
              <label class="flex flex-col gap-1 text-xs text-neutral-500">
                {t("mcp.env")}
                <textarea
                  class={inputClass + " resize-y font-mono"}
                  rows={2}
                  placeholder={t("mcp.envPlaceholder")}
                  value={envText}
                  onInput={(e) => setEnvText((e.target as HTMLTextAreaElement).value)}
                />
              </label>
            </>
          ) : (
            <label class="flex flex-col gap-1 text-xs text-neutral-500">
              {t("mcp.headers")}
              <textarea
                class={inputClass + " resize-y font-mono"}
                rows={2}
                placeholder={t("mcp.headersPlaceholder")}
                value={headersText}
                onInput={(e) => setHeadersText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
