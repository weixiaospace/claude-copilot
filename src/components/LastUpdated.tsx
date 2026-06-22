import { t } from "../lib/i18n";
import { formatRelative } from "../lib/relativeTime";
import { lastUpdated, nowMs, type UpdateKind } from "../lib/updateTimes";

/**
 * Muted "Updated X ago" line for a marketplace/source card. Pass `at` (epoch ms)
 * for an authoritative timestamp (e.g. the CLI's marketplace `lastUpdated`), or
 * `kind`+`name` to fall back to the app's own per-item record. Renders nothing
 * when there's no timestamp. Reads the `nowMs` clock so the label ages on its
 * own, and exposes the absolute time on hover.
 */
export function LastUpdated({
  at,
  kind,
  name,
  class: cls = "",
}: {
  at?: number;
  kind?: UpdateKind;
  name?: string;
  class?: string;
}) {
  const ts = at ?? (kind !== undefined && name !== undefined ? lastUpdated(kind, name) : undefined);
  if (ts === undefined || Number.isNaN(ts)) return null;
  return (
    <div class={"text-xs text-neutral-400 " + cls} title={new Date(ts).toLocaleString()}>
      {t("time.lastUpdated", formatRelative(ts, nowMs.value))}
    </div>
  );
}
