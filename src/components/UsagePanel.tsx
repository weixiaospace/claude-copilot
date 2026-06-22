import { useEffect, useState } from "preact/hooks";
import { Loader2 } from "lucide-preact";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import type { ScopeRef } from "../types/ScopeRef";
import type { UsageResult } from "../types/UsageResult";
import type { UsageBucket } from "../types/UsageBucket";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { PanelHeader } from "./PanelHeader";
import { Segmented } from "./ui/Segmented";

type Granularity = "day" | "week" | "month";

/** Day-granularity results per scope. Week/month are derived client-side, so a
 *  scope is scanned at most once — switching granularity never re-queries. */
const dayCache = new Map<string, UsageResult>();

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

/** ISO-8601 week key (`YYYY-Www`) for a `YYYY-MM-DD` day. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNr = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dayNr + 3); // nearest Thursday
  const firstThursday = d.getTime();
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const yearStartThu = new Date(yearStart);
  yearStartThu.setUTCDate(yearStart.getUTCDate() - ((yearStart.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((firstThursday - yearStartThu.getTime()) / 604_800_000);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Re-bucket day data to week/month in the browser (no extra round-trip). */
function rebucket(day: UsageResult, g: Granularity): UsageResult {
  if (g === "day") return day;
  const map = new Map<string, UsageBucket>();
  for (const b of day.buckets) {
    const key = g === "month" ? b.period.slice(0, 7) : isoWeekKey(b.period);
    const cur = map.get(key);
    if (cur) {
      cur.input += b.input;
      cur.output += b.output;
      cur.cache_read += b.cache_read;
      cur.cache_creation += b.cache_creation;
      cur.total += b.total;
    } else {
      map.set(key, { ...b, period: key });
    }
  }
  const buckets = [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
  return { ...day, buckets };
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
  const scopeKey = JSON.stringify(scope);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [day, setDay] = useState<UsageResult | null>(() => dayCache.get(scopeKey) ?? null);
  // Start in the loading state when there's no cached scan, so the spinner is on
  // screen from the first paint instead of a blank frame before the effect runs.
  const [loading, setLoading] = useState(() => !dayCache.has(scopeKey));

  async function load(force = false) {
    if (!force) {
      const cached = dayCache.get(scopeKey);
      if (cached) {
        setDay(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const r = await invoke("query_usage", { scope, granularity: "day" });
      dayCache.set(scopeKey, r);
      setDay(r);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  // Usage scans are expensive; force a fresh scan only on an explicit fs/global
  // refresh (the in-memory dayCache is bypassed).
  useFsRefresh(() => load(true));

  const data = day ? rebucket(day, granularity) : null;

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        onRefresh={() => load(true)}
        extra={
          <Segmented
            value={granularity}
            onChange={setGranularity}
            options={(["day", "week", "month"] as Granularity[]).map((g) => ({
              value: g,
              label: t(`usage.${g}`),
            }))}
          />
        }
        actions={
          data ? (
            <div class="text-xs text-neutral-500">
              {t("usage.totalTokens")}:{" "}
              <span class="font-medium text-neutral-900 dark:text-neutral-100">
                {fmt(data.total)}
              </span>{" "}
              · {t("usage.sessions")}: {data.sessions}
            </div>
          ) : undefined
        }
      />

      <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {loading && !data && (
          <div class="flex items-center gap-2 py-8 text-sm text-neutral-400">
            <Loader2 size={16} class="animate-spin" />
            {t("usage.loading")}
          </div>
        )}

        {data && data.buckets.length === 0 && !loading && (
          <div class="py-8 text-sm text-neutral-400">{t("usage.empty")}</div>
        )}

        {data && data.buckets.length > 0 && (
          <div class="flex flex-col gap-6">
            <div>
              <div class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                {t("usage.timeline")}
              </div>
              <Bars
                rows={data.buckets.map((b) => ({ label: b.period, value: b.total }))}
                color="bg-accent/70"
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
    </div>
  );
}
