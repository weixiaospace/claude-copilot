import { t } from "./i18n";

/**
 * Format `thenMs` relative to `nowMs` as a short, localized label
 * ("just now", "5 min ago", …), falling back to an absolute date past a week.
 * Pass `nowMs` from the `nowMs` signal so labels re-render as they age.
 */
export function formatRelative(thenMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - thenMs);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", days);
  return new Date(thenMs).toLocaleDateString();
}
