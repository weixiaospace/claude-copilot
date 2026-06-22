import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import { Activity, Loader2, X } from "lucide-preact";
import type { ScopeRef } from "../types/ScopeRef";
import type { McpServer } from "../types/McpServer";
import type { McpKeyVal } from "../types/McpKeyVal";
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

/** Labeled block in the detail view. */
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div class="flex flex-col gap-1">
      <span class="text-xs text-neutral-500">{label}</span>
      {children}
    </div>
  );
}

/** key=value list with values masked unless `reveal`. */
function KeyVals({ items, reveal }: { items: McpKeyVal[]; reveal: boolean }) {
  return (
    <div class="flex flex-col gap-1 font-mono text-xs">
      {items.map((kv) => (
        <div key={kv.key} class="flex gap-2">
          <span class="shrink-0 text-neutral-500">{kv.key}</span>
          <span class="text-neutral-400">=</span>
          <span class="min-w-0 truncate" title={reveal ? kv.value : undefined}>
            {reveal ? kv.value : "••••••"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Connection-health badge (from an on-demand `claude mcp list`). */
function HealthBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    connected: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    needs_auth: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    failed: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    unknown: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  };
  const cls = tone[status];
  if (!cls) return null; // pending is already covered by the approval badge
  return (
    <span class={"shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + cls}>
      {t(`mcp.health.${status}`)}
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
  // Read-only detail view of a server + whether its secret values are revealed.
  const [detail, setDetail] = useState<McpServer | null>(null);
  const [reveal, setReveal] = useState(false);
  // On-demand connection health, keyed by server name; `checking` while running.
  const [health, setHealth] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);

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
    setHealth({}); // stale across scopes; re-check on demand
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useFsRefresh(refresh);

  async function checkHealth() {
    if (checking) return;
    setChecking(true);
    try {
      const list = await invoke("check_mcp_health", { scope });
      const map: Record<string, string> = {};
      for (const h of list) map[h.name] = h.status;
      setHealth(map);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setChecking(false);
    }
  }

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
      <PanelHeader
        actions={
          servers.length > 0 ? (
            <button
              class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
              disabled={checking}
              onClick={() => void checkHealth()}
            >
              {checking ? (
                <Loader2 size={13} class="animate-spin" />
              ) : (
                <Activity size={13} />
              )}
              {t("mcp.checkHealth")}
            </button>
          ) : undefined
        }
        onRefresh={() => refresh()}
        onCreate={() => setCreating(true)}
      />

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
                  <button
                    class="font-medium hover:text-accent"
                    onClick={() => {
                      setReveal(false);
                      setDetail(s);
                    }}
                  >
                    {s.name}
                  </button>
                  <span class="rounded bg-neutral-100 px-1 text-xs text-neutral-500 dark:bg-neutral-800">
                    {s.transport}
                  </span>
                  {s.approval && <ApprovalBadge approval={s.approval} />}
                  {health[s.name] && <HealthBadge status={health[s.name]} />}
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

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""}>
        {detail && (
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
                {t(`mcp.source.${detail.source}`)}
              </span>
              <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                {detail.transport}
              </span>
              {detail.approval && <ApprovalBadge approval={detail.approval} />}
            </div>

            {detail.transport === "stdio" ? (
              <Field label={t("mcp.command")}>
                <code class="block break-all rounded bg-neutral-100 px-2 py-1.5 font-mono text-xs dark:bg-neutral-800">
                  {[detail.command, ...detail.args].filter(Boolean).join(" ") || "—"}
                </code>
              </Field>
            ) : (
              <Field label={t("mcp.url")}>
                <code class="block break-all rounded bg-neutral-100 px-2 py-1.5 font-mono text-xs dark:bg-neutral-800">
                  {detail.url || "—"}
                </code>
              </Field>
            )}

            {(detail.env.length > 0 || detail.headers.length > 0) && (
              <div class="flex justify-end">
                <button
                  class="text-xs text-neutral-400 hover:text-accent"
                  onClick={() => setReveal((v) => !v)}
                >
                  {reveal ? t("mcp.hideValues") : t("mcp.showValues")}
                </button>
              </div>
            )}
            {detail.env.length > 0 && (
              <Field label={t("mcp.envTitle")}>
                <KeyVals items={detail.env} reveal={reveal} />
              </Field>
            )}
            {detail.headers.length > 0 && (
              <Field label={t("mcp.headersTitle")}>
                <KeyVals items={detail.headers} reveal={reveal} />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
