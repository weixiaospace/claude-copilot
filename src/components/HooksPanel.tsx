import { useEffect, useState } from "preact/hooks";
import { FileText, Webhook } from "lucide-preact";
import type { ScopeRef } from "../types/ScopeRef";
import type { HookEntry } from "../types/HookEntry";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import { PanelHeader } from "./PanelHeader";
import { Loading } from "./ui/Loading";

// Matches the Plugins/Skills/MCP card language for a consistent look.
const card =
  "rounded-lg border border-neutral-200 p-3 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700";

/** Plain-language one-liner for the well-known hook events (unknown → none). */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "hooks.event.PreToolUse",
  PostToolUse: "hooks.event.PostToolUse",
  UserPromptSubmit: "hooks.event.UserPromptSubmit",
  Stop: "hooks.event.Stop",
  SubagentStop: "hooks.event.SubagentStop",
  Notification: "hooks.event.Notification",
  SessionStart: "hooks.event.SessionStart",
  SessionEnd: "hooks.event.SessionEnd",
  PreCompact: "hooks.event.PreCompact",
};

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
  const [loading, setLoading] = useState(true);

  async function refresh(initial = false) {
    if (initial) setLoading(true);
    try {
      setEntries(await invoke("list_hooks", { scope }));
    } catch (e) {
      toast.error(String(e));
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope)]);
  useFsRefresh(refresh);

  const groups = groupBySource(entries);

  return (
    <div class="flex h-full flex-col">
      <PanelHeader onRefresh={() => refresh()} />
      <div class="min-h-0 flex-1 overflow-auto px-6 pb-3">
        {loading ? (
          <Loading />
        ) : groups.length === 0 ? (
          <div class="py-8 text-sm text-neutral-400">{t("hooks.empty")}</div>
        ) : null}
        {!loading &&
          groups.map((g) => (
            <section key={(g.path ?? "") + g.source} class="mb-5">
              <header class="mb-1.5 flex items-center gap-2">
                <span class="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
                  {t(`hooks.source.${g.source}`)}
                </span>
                {g.path && (
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400"
                    title={g.path}
                  >
                    {g.path}
                  </span>
                )}
                {g.path && (
                  <button
                    class="inline-flex shrink-0 items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-accent"
                    onClick={async () => {
                      try {
                        await invoke("open_in_editor", { path: g.path! });
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    <FileText size={13} /> {t("hooks.openFile")}
                  </button>
                )}
              </header>
              <ul class="flex flex-col gap-2">
                {g.entries.map((e, i) => {
                  const labelKey = EVENT_LABELS[e.event];
                  return (
                    <li key={i} class={card}>
                      <div class="flex items-center gap-2">
                        <Webhook size={15} class="shrink-0 text-neutral-400" />
                        <span class="text-sm font-semibold">{e.event}</span>
                        {labelKey && <span class="text-xs text-neutral-400">{t(labelKey)}</span>}
                        {e.matcher && (
                          <span class="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                            {e.matcher}
                          </span>
                        )}
                      </div>
                      <code class="mt-2 block whitespace-pre-wrap break-words rounded-md bg-neutral-100 px-2 py-1.5 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {e.command}
                      </code>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
