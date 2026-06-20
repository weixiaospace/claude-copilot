import { useEffect, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Check, LogIn, RefreshCw, Zap } from "lucide-preact";
import type { Profile } from "../types/Profile";
import type { ProviderKind } from "../types/ProviderKind";
import type { AuthMode } from "../types/AuthMode";
import type { AuthStatus } from "../types/AuthStatus";
import type { ClaudeSubscriptionQuota } from "../types/ClaudeSubscriptionQuota";
import type { RateLimitTier } from "../types/RateLimitTier";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { activeByScope, profiles, providersTick, reloadActiveProfiles } from "../lib/signals";
import { PanelHeader } from "./PanelHeader";
import { Modal } from "./ui/Modal";
import { Select } from "./ui/Select";
import { Button } from "./ui/button";

const KINDS: ProviderKind[] = ["anthropic", "bedrock", "vertex", "foundry"];
const ANTHROPIC_MODES: AuthMode[] = ["apiKey", "authToken", "subscription", "helper"];

const WINDOW_LABELS: Record<string, string> = {
  five_hour: t("auth.window.five_hour"),
  seven_day: t("auth.window.seven_day"),
  seven_day_opus: t("auth.window.seven_day_opus"),
  seven_day_sonnet: t("auth.window.seven_day_sonnet"),
  overage: t("auth.window.overage"),
};

/** Mirrors core::providers::secret_field — whether a secret input is shown. */
function needsSecret(kind: ProviderKind, authMode: AuthMode | null): boolean {
  if (kind === "anthropic") return authMode === "apiKey" || authMode === "authToken";
  return kind === "bedrock" || kind === "foundry";
}

function formatResetTime(ts: number): string {
  const diff = ts * 1000 - Date.now();
  if (diff <= 0) return t("auth.resetSoon");
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return t("auth.resetDays", days, hours, mins);
  if (hours > 0) return t("auth.resetHours", hours, mins);
  return t("auth.resetMinutes", mins);
}

function QuotaBar({ tier }: { tier: RateLimitTier }) {
  const pct = Math.round(tier.utilization * 100);
  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between text-sm">
        <span>{WINDOW_LABELS[tier.window] ?? tier.window}</span>
        <span class={pct > 90 ? "text-red-500" : pct > 70 ? "text-yellow-600" : ""}>{pct}%</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          class={
            "h-full rounded-full " +
            (pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500")
          }
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {tier.resets_at && (
        <div class="text-xs text-neutral-500">{formatResetTime(tier.resets_at)}</div>
      )}
    </div>
  );
}

interface FormState {
  id: string | null;
  name: string;
  kind: ProviderKind;
  authMode: AuthMode | null;
  baseUrl: string;
  secret: string;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  kind: "anthropic",
  authMode: "apiKey",
  baseUrl: "",
  secret: "",
};

/** One-click presets: open the form pre-filled, user only pastes the key.
 *  Kimi Code = Moonshot's Anthropic-compatible endpoint + auth token. */
const PRESETS: { id: string; label: string; form: FormState }[] = [
  {
    id: "kimi",
    label: "Kimi Code",
    form: {
      id: null,
      name: "Kimi Code",
      kind: "anthropic",
      authMode: "authToken",
      baseUrl: "https://api.moonshot.cn/anthropic",
      secret: "",
    },
  },
];

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

function ProfileFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const showSecret = needsSecret(form.kind, form.kind === "anthropic" ? form.authMode : null);

  return (
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1 text-xs text-neutral-500">
        {t("providers.name")}
        <input
          class={inputClass}
          value={form.name}
          onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-neutral-500">
        {t("providers.kind")}
        <Select
          value={form.kind}
          onChange={(e) => {
            const kind = (e.target as HTMLSelectElement).value as ProviderKind;
            set({ kind, authMode: kind === "anthropic" ? (form.authMode ?? "apiKey") : null });
          }}
        >
          {KINDS.map((k) => (
            <option value={k}>{k}</option>
          ))}
        </Select>
      </label>
      {form.kind === "anthropic" && (
        <label class="flex flex-col gap-1 text-xs text-neutral-500">
          {t("providers.authMode")}
          <Select
            value={form.authMode ?? "apiKey"}
            onChange={(e) => set({ authMode: (e.target as HTMLSelectElement).value as AuthMode })}
          >
            {ANTHROPIC_MODES.map((m) => (
              <option value={m}>{m}</option>
            ))}
          </Select>
        </label>
      )}
      <label class="flex flex-col gap-1 text-xs text-neutral-500">
        {t("providers.baseUrl")}
        <input
          class={inputClass}
          value={form.baseUrl}
          placeholder="https://…"
          onInput={(e) => set({ baseUrl: (e.target as HTMLInputElement).value })}
        />
      </label>
      {showSecret && (
        <label class="flex flex-col gap-1 text-xs text-neutral-500">
          {t("providers.secret")}
          <input
            type="password"
            class={inputClass}
            value={form.secret}
            placeholder={form.id ? t("providers.secretKeep") : ""}
            onInput={(e) => set({ secret: (e.target as HTMLInputElement).value })}
          />
        </label>
      )}
    </div>
  );
}

/**
 * Global Connections page (the app's own credential feature). Profiles live in
 * the desktop's own profiles.json; secrets go to the OS keychain. Opened from
 * the product header; create/edit happens in a modal.
 */
export function ConnectionsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [quota, setQuota] = useState<ClaudeSubscriptionQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  async function refreshAuth() {
    setAuthLoading(true);
    try {
      const status = await invoke("get_claude_auth_status");
      setAuthStatus(status);
    } catch (e) {
      setAuthStatus(null);
      console.error("get_claude_auth_status failed", e);
    } finally {
      setAuthLoading(false);
    }
  }

  async function refreshQuota() {
    setQuotaLoading(true);
    try {
      const q = await invoke("get_claude_subscription_quota");
      setQuota(q);
    } catch (e) {
      setQuota(null);
      setError(t("auth.quotaError"));
      console.error("get_claude_subscription_quota failed", e);
    } finally {
      setQuotaLoading(false);
    }
  }

  async function openLogin() {
    try {
      await invoke("claude_auth_login");
    } catch (e) {
      setError(String(e));
    }
  }

  async function refresh() {
    try {
      const ps = await invoke("list_profiles", { input: { check_secrets: true } });
      profiles.value = ps;
      await reloadActiveProfiles();
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
    void refreshAuth().then(() => void refreshQuota());
  }, []);

  async function save() {
    if (!form || !form.name.trim()) return;
    const input = {
      name: form.name.trim(),
      kind: form.kind,
      authMode: form.kind === "anthropic" ? form.authMode : null,
      baseUrl: form.baseUrl.trim() || null,
    };
    const secret = form.secret ? form.secret : null;
    try {
      if (form.id) await invoke("update_profile", { id: form.id, input, secret });
      else await invoke("create_profile", { input, secret });
      setForm(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(p: Profile) {
    if (!(await confirm(t("providers.confirmDelete"), { kind: "warning" }))) return;
    try {
      await invoke("delete_profile", { id: p.id });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function activateForUser(p: Profile) {
    try {
      await invoke("activate_profile", { id: p.id, scope: { kind: "user" } });
      await reloadActiveProfiles();
      providersTick.value++; // nudge SettingsPanel (env block changed) to re-read
    } catch (e) {
      setError(String(e));
    }
  }

  async function setSubscriptionAsDefault() {
    try {
      await invoke("deactivate_provider", { scope: { kind: "user" } });
      await reloadActiveProfiles();
      providersTick.value++;
    } catch (e) {
      setError(String(e));
    }
  }

  const userActive = activeByScope.value["user"];
  const subscriptionActive = userActive?.state === "subscription";
  const unmanagedActive = userActive?.state === "unmanaged";

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        title={t("providers.title")}
        actions={PRESETS.map((p) => (
          <Button
            key={p.id}
            variant="ghost"
            title={t("providers.quickConnect", p.label)}
            onClick={() => setForm({ ...p.form })}
          >
            <Zap size={14} class="mr-1 text-accent" />
            {p.label}
          </Button>
        ))}
        onRefresh={() => void refresh()}
        createLabel={t("providers.new")}
        onCreate={() => setForm({ ...EMPTY })}
      />

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}

      <div class="mx-6 mb-4 rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-sm font-medium">{t("auth.claudeSubscription")}</span>
            {authStatus?.logged_in ? (
              <span class="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                {t("auth.loggedIn")}
              </span>
            ) : (
              <span class="inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {t("auth.notLoggedIn")}
              </span>
            )}
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                void refreshAuth();
                void refreshQuota();
              }}
              title={t("resource.refresh")}
              aria-label={t("resource.refresh")}
              disabled={authLoading || quotaLoading}
            >
              <RefreshCw size={14} class={authLoading || quotaLoading ? "animate-spin" : ""} />
            </Button>
            {authStatus?.logged_in ? (
              <>
                <Button variant="ghost" onClick={() => void openLogin()}>
                  <LogIn size={14} class="mr-1" />
                  {t("auth.relogin")}
                </Button>
                {subscriptionActive ? (
                  <Button variant="ghost" disabled>
                    <Check size={14} class="mr-1 text-accent" />
                    {t("auth.userDefault")}
                  </Button>
                ) : unmanagedActive ? (
                  <Button variant="ghost" disabled>
                    {t("auth.externalManaged")}
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => void setSubscriptionAsDefault()}>
                    {t("auth.setUserDefault")}
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={() => void openLogin()}>
                <LogIn size={14} class="mr-1" />
                {t("auth.login")}
              </Button>
            )}
          </div>
        </div>

        {authStatus?.logged_in && (
          <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
            {authStatus.subscription_type && (
              <span>
                {t("auth.subscriptionType")}: {authStatus.subscription_type}
              </span>
            )}
            {authStatus.rate_limit_tier && (
              <span>
                {t("auth.rateLimitTier")}: {authStatus.rate_limit_tier}
              </span>
            )}
          </div>
        )}

        {quota?.error && (
          <div class="mt-2 text-xs text-red-500">{quota.error}</div>
        )}

        {quota && quota.tiers.length > 0 && (
          <div class="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <h3 class="mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {t("auth.quotaTitle")}
            </h3>
            <div class="flex flex-col gap-2">
              {quota.tiers.map((tier) => (
                <QuotaBar key={tier.window} tier={tier} />
              ))}
            </div>
            {quota.extra_usage?.is_enabled && (
              <div class="mt-2 text-xs text-neutral-500">
                {t("auth.hasExtraUsage")}
                {quota.extra_usage.utilization != null &&
                  `: ${Math.round(quota.extra_usage.utilization * 100)}%`}
              </div>
            )}
          </div>
        )}
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {profiles.value.length === 0 && (
          <div class="py-8 text-sm text-neutral-400">{t("providers.empty")}</div>
        )}
        <ul class="flex flex-col gap-1">
          {profiles.value.map((p) => {
            const missing = !p.hasSecret && needsSecret(p.kind, p.authMode ?? null);
            const active = userActive?.state === "profile" && userActive.id === p.id;
            return (
              <li
                key={p.id}
                class={
                  "flex items-center gap-2 rounded-md border px-3 py-2 " +
                  (active
                    ? "border-accent bg-accent-soft dark:bg-accent-soft-dark"
                    : "border-neutral-200 dark:border-neutral-800")
                }
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 text-sm font-medium">
                    {active && <Check size={14} class="shrink-0 text-accent" />}
                    <span class="truncate">{p.name}</span>
                  </div>
                  <div class="truncate text-xs text-neutral-500">
                    {p.kind}
                    {p.authMode ? ` · ${p.authMode}` : ""}
                    {missing ? ` · ${t("providers.credentialMissing")}` : ""}
                  </div>
                </div>
                <button
                  class={
                    "shrink-0 text-xs " +
                    (active
                      ? "text-accent"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")
                  }
                  disabled={active}
                  onClick={() => void activateForUser(p)}
                >
                  {active ? t("activation.userActive") : t("activation.setUser")}
                </button>
                <button
                  class="shrink-0 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  onClick={() =>
                    setForm({
                      id: p.id,
                      name: p.name,
                      kind: p.kind,
                      authMode: p.authMode ?? null,
                      baseUrl: p.baseUrl ?? "",
                      secret: "",
                    })
                  }
                >
                  {t("providers.edit")}
                </button>
                <button
                  class="shrink-0 text-xs text-neutral-400 hover:text-red-500"
                  onClick={() => void remove(p)}
                >
                  {t("detail.delete")}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? t("providers.edit") : t("providers.new")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              {t("providers.cancel")}
            </Button>
            <Button onClick={() => void save()}>{t("detail.save")}</Button>
          </>
        }
      >
        {form && <ProfileFields form={form} setForm={setForm} />}
      </Modal>
    </div>
  );
}
