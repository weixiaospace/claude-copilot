import { useEffect, useRef } from "preact/hooks";
import { fsTick } from "./signals";

/**
 * Reload a panel's data **in place** whenever the filesystem watcher fires
 * (or the global refresh button bumps `fsTick`), without remounting the panel.
 *
 * This replaces the old `key={…:fsTick.value}` remount strategy in
 * ResourceArea, which threw away tab / scroll / selection state on every
 * `resource-changed` event and caused a visible flash. By subscribing to the
 * signal here and only re-running `refresh()`, component instances persist and
 * local UI state survives the reload.
 *
 * Reading `fsTick.value` during render subscribes the component to the signal,
 * so the effect re-runs on every bump. A ref holds the last-seen tick so the
 * panel's own mount-time load is never duplicated (the first run is skipped,
 * even when `fsTick` is already nonzero at mount).
 */
export function useFsRefresh(refresh: () => void | Promise<void>): void {
  const tick = fsTick.value;
  const seen = useRef(tick);
  useEffect(() => {
    if (tick === seen.current) return;
    seen.current = tick;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
}
