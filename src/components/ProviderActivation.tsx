import { useEffect, useState } from "preact/hooks";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import type { Profile } from "../types/Profile";
import type { ActiveProvider } from "../types/ActiveProvider";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

const SUBSCRIPTION = "__subscription";
const UNMANAGED = "__unmanaged";

/** Per-scope provider activation: shows the active provider for the selected
 * scope and lets the user switch it (writes/clears the env block). */
export function ProviderActivation({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState<ActiveProvider | null>(null);

  async function load() {
    try {
      const [ps, a] = await Promise.all([
        invoke("list_profiles"),
        invoke("get_active_profile", { scope: ref }),
      ]);
      setProfiles(ps);
      setActive(a);
    } catch {
      // keep the header quiet on failure
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line
  }, [scope.id]);

  // Nothing to choose and nothing unusual to show.
  if (profiles.length === 0 && active?.state !== "unmanaged") return null;

  const value =
    active?.state === "profile"
      ? active.id
      : active?.state === "unmanaged"
        ? UNMANAGED
        : SUBSCRIPTION;

  async function onChange(v: string) {
    try {
      if (v === SUBSCRIPTION) await invoke("deactivate_provider", { scope: ref });
      else if (v !== UNMANAGED) await invoke("activate_profile", { id: v, scope: ref });
      await load();
    } catch (e) {
      console.error("activation failed", e);
    }
  }

  return (
    <label class="flex items-center gap-1 text-xs text-neutral-500">
      <span>{t("activation.label")}</span>
      <select
        class="rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
        value={value}
        onChange={(e) => void onChange((e.target as HTMLSelectElement).value)}
      >
        {active?.state === "unmanaged" && (
          <option value={UNMANAGED}>{t("activation.unmanaged")}</option>
        )}
        <option value={SUBSCRIPTION}>{t("activation.subscription")}</option>
        {profiles.map((p) => (
          <option value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}
