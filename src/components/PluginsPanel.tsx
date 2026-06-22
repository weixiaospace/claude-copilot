import { useEffect, useMemo, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import { notifyError } from "../lib/notify";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Package,
  Power,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from "lucide-preact";
import type { InstalledPlugin } from "../types/InstalledPlugin";
import type { Marketplace } from "../types/Marketplace";
import type { AvailablePlugin } from "../types/AvailablePlugin";
import type { BundledResource } from "../types/BundledResource";
import type { BundledKind } from "../types/BundledKind";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { useFsRefresh } from "../lib/useFsRefresh";
import { ResourceDetail } from "./ResourceDetail";
import { PanelHeader } from "./PanelHeader";
import { Segmented } from "./ui/Segmented";
import { CreateNameDialog } from "./CreateNameDialog";

type Tab = "marketplaces" | "available" | "installed";

const card =
  "rounded-lg border border-neutral-200 p-3 transition-colors dark:border-neutral-800";

function Badge({ children, tone = "neutral" }: { children: any; tone?: "neutral" | "accent" }) {
  const cls =
    tone === "accent"
      ? "bg-accent-soft text-accent dark:bg-accent-soft-dark"
      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span class={"shrink-0 rounded px-1.5 py-0.5 text-xs font-medium " + cls}>{children}</span>
  );
}

/** Split a backend source string ("github:owner/repo") into kind + detail. */
function splitSource(source: string): { kind: string; detail: string } {
  const i = source.indexOf(":");
  return i === -1 ? { kind: source, detail: "" } : { kind: source.slice(0, i), detail: source.slice(i + 1) };
}

const KIND_LABEL: Record<BundledKind, string> = {
  skill: "bundled.skill",
  agent: "bundled.agent",
  command: "bundled.command",
  hook: "bundled.hook",
};
const KIND_ORDER: BundledKind[] = ["skill", "agent", "command", "hook"];

function kindCounts(rs: BundledResource[]): [BundledKind, number][] {
  return KIND_ORDER.map((k) => [k, rs.filter((r) => r.kind === k).length] as [BundledKind, number]).filter(
    ([, n]) => n > 0,
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors " +
        (active
          ? "border-accent bg-accent-soft text-accent dark:bg-accent-soft-dark"
          : "border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800")
      }
      onClick={onClick}
    >
      {label}
      <span class={active ? "text-accent/70" : "text-neutral-400"}>{count}</span>
    </button>
  );
}

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [markets, setMarkets] = useState<Marketplace[]>([]);
  const [catalog, setCatalog] = useState<AvailablePlugin[]>([]);
  const [bundled, setBundled] = useState<Record<string, BundledResource[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [tab, setTab] = useState<Tab>("installed");
  const [query, setQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [addingMarket, setAddingMarket] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [p, m, c] = await Promise.all([
        invoke("list_plugins"),
        invoke("list_marketplaces"),
        invoke("list_available_plugins"),
      ]);
      setPlugins(p);
      setMarkets(m);
      setCatalog(c);
      // Eager-load bundled resources for installed plugins (usually few) so the
      // cards can show resource counts without expanding each one.
      const entries = await Promise.all(
        p.map(
          async (pl) =>
            [
              pl.id,
              await invoke("list_bundled_resources", { installPath: pl.install_path }).catch(
                () => [] as BundledResource[],
              ),
            ] as const,
        ),
      );
      setBundled(Object.fromEntries(entries));
    } catch (e) {
      await notifyError(e);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useFsRefresh(refresh);

  // Wrap a CLI mutation: surface errors, refresh on success.
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      await notifyError(e);
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const catalogById = useMemo(() => {
    const m = new Map<string, AvailablePlugin>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  const marketCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of catalog) m[c.marketplace] = (m[c.marketplace] ?? 0) + 1;
    return m;
  }, [catalog]);

  const q = query.trim().toLowerCase();
  const matchesQuery = (c: AvailablePlugin) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.author.toLowerCase().includes(q);
  // Available plugins matching the search, then the per-marketplace counts and
  // the marketplace filter applied on top.
  const availableAll = catalog.filter((c) => !c.installed && matchesQuery(c));
  const availMarketCounts: Record<string, number> = {};
  for (const c of availableAll) availMarketCounts[c.marketplace] = (availMarketCounts[c.marketplace] ?? 0) + 1;
  const availableMarkets = Object.keys(availMarketCounts).sort();
  const available = availableAll.filter((c) => !marketFilter || c.marketplace === marketFilter);
  const installed = plugins.filter((p) => !q || p.name.toLowerCase().includes(q));
  const filteredMarkets = markets.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.source.toLowerCase().includes(q),
  );

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        title={t("plugins.title")}
        extra={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "marketplaces", label: `${t("plugins.marketplaces")} (${markets.length})` },
              { value: "available", label: `${t("plugins.available")} (${catalog.filter((c) => !c.installed).length})` },
              { value: "installed", label: `${t("plugins.installed")} (${plugins.length})` },
            ]}
          />
        }
        actions={
          <div class="relative">
            <Search
              size={15}
              class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              class="w-48 rounded-md border border-neutral-200 bg-transparent py-1.5 pl-8 pr-2 text-sm dark:border-neutral-700"
              placeholder={t("plugins.search")}
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        }
        onRefresh={() => void refresh()}
        createLabel={tab === "marketplaces" ? t("plugins.addMarketplace") : undefined}
        onCreate={tab === "marketplaces" ? () => setAddingMarket(true) : undefined}
      />

      <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {/* ── Marketplaces ── */}
        {tab === "marketplaces" && (
          <div class="flex flex-col gap-2">
            {filteredMarkets.length === 0 && (
              <div class="py-8 text-sm text-neutral-400">{t("plugins.noMarketplaces")}</div>
            )}
            {filteredMarkets.map((m) => {
              const { kind, detail } = splitSource(m.source);
              return (
                <div key={m.name} class={card}>
                  <div class="flex items-center gap-2">
                    <Store size={16} class="shrink-0 text-neutral-400" />
                    <span class="text-sm font-semibold">{m.name}</span>
                    {kind && <Badge>{kind}</Badge>}
                    <Badge tone="accent">{t("plugins.count", marketCounts[m.name] ?? 0)}</Badge>
                    <div class="flex-1" />
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
                      disabled={busy}
                      onClick={() => void run(() => invoke("update_marketplace", { name: m.name }))}
                    >
                      <RefreshCw size={13} /> {t("plugins.update")}
                    </button>
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void run(() => invoke("remove_marketplace", { name: m.name }))}
                    >
                      <Trash2 size={13} /> {t("detail.delete")}
                    </button>
                  </div>
                  {detail && (
                    <div class="mt-1 truncate pl-6 font-mono text-xs text-neutral-400" title={detail}>
                      {detail}
                    </div>
                  )}
                  {m.install_location && (
                    <div
                      class="truncate pl-6 font-mono text-xs text-neutral-400"
                      title={m.install_location}
                    >
                      {m.install_location}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Available ── */}
        {tab === "available" && (
          <div>
            {availableMarkets.length > 1 && (
              <div class="mb-3 flex flex-wrap gap-1.5">
                <FilterChip
                  label={t("plugins.allMarkets")}
                  count={availableAll.length}
                  active={marketFilter === ""}
                  onClick={() => setMarketFilter("")}
                />
                {availableMarkets.map((m) => (
                  <FilterChip
                    key={m}
                    label={m}
                    count={availMarketCounts[m]}
                    active={marketFilter === m}
                    onClick={() => setMarketFilter(m)}
                  />
                ))}
              </div>
            )}
            <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {available.length === 0 && (
                <div class="py-8 text-sm text-neutral-400">{t("plugins.noAvailable")}</div>
              )}
              {available.map((a) => (
              <div key={a.id} class={card + " flex flex-col gap-1.5"}>
                <div class="flex items-center gap-2">
                  <Package size={16} class="shrink-0 text-neutral-400" />
                  <span class="min-w-0 truncate text-sm font-semibold">{a.name}</span>
                  {a.version && <Badge>v{a.version}</Badge>}
                  <div class="flex-1" />
                  <button
                    class="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void run(() => invoke("install_plugin", { name: a.id }))}
                  >
                    <Download size={13} /> {t("plugins.install")}
                  </button>
                </div>
                {a.description && (
                  <p class="line-clamp-2 text-xs text-neutral-500">{a.description}</p>
                )}
                <div class="flex items-center gap-2 text-xs text-neutral-400">
                  <span>{a.marketplace}</span>
                  {a.author && <span>· {t("plugins.by", a.author)}</span>}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

        {/* ── Installed ── */}
        {tab === "installed" && (
          <div class="flex flex-col gap-2">
            {installed.length === 0 && (
              <div class="py-8 text-sm text-neutral-400">{t("plugins.empty")}</div>
            )}
            {installed.map((p) => {
              const isOpen = expanded.has(p.id);
              const resources = bundled[p.id] ?? [];
              const counts = kindCounts(resources);
              const desc = catalogById.get(p.id)?.description;
              return (
                <div key={p.id} class={card}>
                  <div class="flex items-center gap-2">
                    <button
                      class="shrink-0 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                      onClick={() => toggleExpand(p.id)}
                      aria-label="expand"
                    >
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span class="min-w-0 truncate text-sm font-semibold">{p.name}</span>
                    {p.version && p.version !== "unknown" && <Badge>v{p.version}</Badge>}
                    <Badge>{t(`hooks.source.${p.scope}`)}</Badge>
                    <span
                      class={
                        "inline-flex shrink-0 items-center gap-1 text-xs " +
                        (p.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400")
                      }
                    >
                      <span
                        class={
                          "inline-block h-1.5 w-1.5 rounded-full " +
                          (p.enabled ? "bg-emerald-500" : "bg-neutral-400")
                        }
                      />
                      {p.enabled ? t("plugins.enable") : t("plugins.disabled")}
                    </span>
                    <div class="flex-1" />
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
                      disabled={busy}
                      onClick={() => void run(() => invoke("toggle_plugin", { name: p.id, enable: !p.enabled }))}
                    >
                      <Power size={13} /> {p.enabled ? t("plugins.disable") : t("plugins.enable")}
                    </button>
                    <button
                      class="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (await confirm(t("plugins.confirmUninstall"), { kind: "warning" })) {
                            await run(() => invoke("uninstall_plugin", { name: p.id }));
                          }
                        })()
                      }
                    >
                      <Trash2 size={13} /> {t("plugins.uninstall")}
                    </button>
                  </div>

                  <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-neutral-400">
                    <span>{p.marketplace}</span>
                    {counts.map(([k, n]) => (
                      <span key={k} class="inline-flex items-center gap-1">
                        <span class="h-1 w-1 rounded-full bg-accent" />
                        {n} {t(KIND_LABEL[k])}
                      </span>
                    ))}
                  </div>
                  {desc && <p class="mt-1 line-clamp-2 pl-6 text-xs text-neutral-500">{desc}</p>}

                  {isOpen && (
                    <div class="mt-2 border-t border-neutral-200 pt-2 pl-6 dark:border-neutral-800">
                      {resources.length === 0 ? (
                        <div class="text-xs text-neutral-400">{t("plugins.noBundled")}</div>
                      ) : (
                        <ul class="flex flex-col gap-0.5">
                          {resources.map((b) => (
                            <li key={b.path}>
                              <button
                                class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                onClick={() =>
                                  setSelected({ name: b.name, description: null, path: b.path })
                                }
                              >
                                <span class="w-14 shrink-0 text-neutral-400">{t(KIND_LABEL[b.kind])}</span>
                                <span class="truncate">{b.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ResourceDetail resource={selected} onClose={() => setSelected(null)} readOnly />

      <CreateNameDialog
        open={addingMarket}
        title={t("plugins.addMarketplace")}
        placeholder={t("plugins.addMarketplacePlaceholder")}
        onClose={() => setAddingMarket(false)}
        onCreate={async (source) => {
          await invoke("add_marketplace", { source });
          await refresh();
        }}
      />
    </div>
  );
}
