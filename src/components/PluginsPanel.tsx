import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { InstalledPlugin } from "../types/InstalledPlugin";
import type { Marketplace } from "../types/Marketplace";
import type { AvailablePlugin } from "../types/AvailablePlugin";
import type { BundledResource } from "../types/BundledResource";
import type { FileResource } from "../types/FileResource";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";
import { ResourceDetail } from "./ResourceDetail";

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [markets, setMarkets] = useState<Marketplace[]>([]);
  const [available, setAvailable] = useState<AvailablePlugin[]>([]);
  const [expanded, setExpanded] = useState<Record<string, BundledResource[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FileResource | null>(null);
  const [newMarket, setNewMarket] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [p, m, a] = await Promise.all([
        invoke("list_plugins"),
        invoke("list_marketplaces"),
        invoke("list_available_plugins"),
      ]);
      setPlugins(p);
      setMarkets(m);
      setAvailable(a.filter((x) => !x.installed));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  // Wrap a CLI mutation: surface errors, refresh on success.
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setError(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(p: InstalledPlugin) {
    const next = new Set(open);
    if (next.has(p.id)) {
      next.delete(p.id);
    } else {
      next.add(p.id);
      if (!expanded[p.id]) {
        try {
          const bundled = await invoke("list_bundled_resources", { installPath: p.install_path });
          setExpanded((m) => ({ ...m, [p.id]: bundled }));
        } catch (e) {
          setError(String(e));
        }
      }
    }
    setOpen(next);
  }

  return (
    <div class="flex h-full flex-col overflow-auto">
      {error && <div class="px-6 pt-3 text-sm text-red-500">{error}</div>}

      {/* Marketplaces */}
      <section class="px-6 py-3">
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("plugins.marketplaces")}
        </h3>
        <div class="mb-2 flex gap-2">
          <input
            class="w-72 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
            placeholder={t("plugins.addMarketplacePlaceholder")}
            value={newMarket}
            onInput={(e) => setNewMarket((e.target as HTMLInputElement).value)}
          />
          <Button
            disabled={busy || !newMarket.trim()}
            onClick={() =>
              void run(async () => {
                await invoke("add_marketplace", { source: newMarket.trim() });
                setNewMarket("");
              })
            }
          >
            {t("plugins.add")}
          </Button>
        </div>
        <ul class="flex flex-col gap-1">
          {markets.map((m) => (
            <li
              key={m.name}
              class="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span class="font-medium">{m.name}</span>
              <span class="truncate text-xs text-neutral-500">{m.source}</span>
              <div class="flex-1" />
              <button
                class="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                disabled={busy}
                onClick={() => void run(() => invoke("update_marketplace", { name: m.name }))}
              >
                {t("plugins.update")}
              </button>
              <button
                class="text-xs text-neutral-400 hover:text-red-500"
                disabled={busy}
                onClick={() => void run(() => invoke("remove_marketplace", { name: m.name }))}
              >
                {t("detail.delete")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Installed plugins */}
      <section class="px-6 py-3">
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("plugins.installed")}
        </h3>
        {plugins.length === 0 && (
          <div class="text-sm text-neutral-400">{t("plugins.empty")}</div>
        )}
        <ul class="flex flex-col gap-1">
          {plugins.map((p) => (
            <li key={p.id} class="rounded-md border border-neutral-200 dark:border-neutral-800">
              <div class="flex items-center gap-2 px-3 py-2">
                <button
                  class="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                  onClick={() => void toggleExpand(p)}
                  aria-label="expand"
                >
                  {open.has(p.id) ? "▾" : "▸"}
                </button>
                <span class="text-sm font-medium">{p.name}</span>
                <span class="text-xs text-neutral-400">{p.marketplace}</span>
                {!p.enabled && (
                  <span class="rounded bg-neutral-100 px-1.5 text-xs text-neutral-500 dark:bg-neutral-800">
                    {t("plugins.disabled")}
                  </span>
                )}
                <div class="flex-1" />
                <button
                  class="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  disabled={busy}
                  onClick={() => void run(() => invoke("toggle_plugin", { name: p.id, enable: !p.enabled }))}
                >
                  {p.enabled ? t("plugins.disable") : t("plugins.enable")}
                </button>
                <button
                  class="text-xs text-neutral-400 hover:text-red-500"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      if (await confirm(t("plugins.confirmUninstall"), { kind: "warning" })) {
                        await run(() => invoke("uninstall_plugin", { name: p.id }));
                      }
                    })()
                  }
                >
                  {t("plugins.uninstall")}
                </button>
              </div>
              {open.has(p.id) && (
                <div class="border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
                  {(expanded[p.id] ?? []).length === 0 ? (
                    <div class="text-xs text-neutral-400">{t("plugins.noBundled")}</div>
                  ) : (
                    <ul class="flex flex-col gap-0.5">
                      {(expanded[p.id] ?? []).map((b) => (
                        <li key={b.path}>
                          <button
                            class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            onClick={() =>
                              setSelected({ name: b.name, description: null, path: b.path })
                            }
                          >
                            <span class="w-16 shrink-0 text-neutral-400">{b.kind}</span>
                            <span class="truncate">{b.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Available plugins */}
      {available.length > 0 && (
        <section class="px-6 py-3">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            {t("plugins.available")}
          </h3>
          <ul class="flex flex-col gap-1">
            {available.map((a) => (
              <li
                key={a.id}
                class="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span class="font-medium">{a.name}</span>
                <span class="text-xs text-neutral-400">{a.marketplace}</span>
                <div class="flex-1" />
                <button
                  class="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  disabled={busy}
                  onClick={() => void run(() => invoke("install_plugin", { name: a.id }))}
                >
                  {t("plugins.install")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ResourceDetail resource={selected} onClose={() => setSelected(null)} readOnly />
    </div>
  );
}
