import { useEffect, useState } from "preact/hooks";
import type { ScopeRef } from "../types/ScopeRef";
import type { UsageResult } from "../types/UsageResult";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";

type Granularity = "day" | "week" | "month";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function Bars({
  rows,
  color,
}: {
  rows: { label: string; value: number }[];
  color: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div class="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.label} class="flex items-center gap-2 text-xs">
          <div class="w-40 shrink-0 truncate text-neutral-500" title={r.label}>
            {r.label}
          </div>
          <div class="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
            <div
              class={"h-4 rounded " + color}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div class="w-16 shrink-0 text-right tabular-nums text-neutral-500">
            {fmt(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Usage dashboard: token totals over time + per-model, for the given scope. */
export function UsagePanel({ scope }: { scope: ScopeRef }) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [data, setData] = useState<UsageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke("query_usage", { scope, granularity })
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope), granularity]);

  return (
    <div class="flex h-full flex-col overflow-auto p-6">
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="inline-flex rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-800">
          {(["day", "week", "month"] as Granularity[]).map((g) => (
            <button
              key={g}
              class={
                "rounded px-2 py-0.5 transition-colors " +
                (granularity === g
                  ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")
              }
              onClick={() => setGranularity(g)}
            >
              {t(`usage.${g}`)}
            </button>
          ))}
        </div>
        {data && (
          <div class="text-xs text-neutral-500">
            {t("usage.totalTokens")}:{" "}
            <span class="font-medium text-neutral-900 dark:text-neutral-100">
              {fmt(data.total)}
            </span>{" "}
            · {t("usage.sessions")}: {data.sessions}
          </div>
        )}
      </div>

      {error && <div class="text-sm text-red-500">{error}</div>}
      {data && data.buckets.length === 0 && !error && (
        <div class="text-sm text-neutral-400">{t("usage.empty")}</div>
      )}

      {data && data.buckets.length > 0 && (
        <div class="flex flex-col gap-6">
          <div>
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {t("usage.timeline")}
            </div>
            <Bars
              rows={data.buckets.map((b) => ({ label: b.period, value: b.total }))}
              color="bg-orange-400/70"
            />
          </div>
          <div>
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {t("usage.byModel")}
            </div>
            <Bars
              rows={data.models.map((m) => ({ label: m.model, value: m.total }))}
              color="bg-sky-400/70"
            />
          </div>
        </div>
      )}
    </div>
  );
}
