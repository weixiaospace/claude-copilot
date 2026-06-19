import { useEffect, useRef, useState } from "preact/hooks";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Profile } from "../types/Profile";
import type { ProviderKind } from "../types/ProviderKind";
import type { AuthMode } from "../types/AuthMode";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

const KINDS: ProviderKind[] = ["anthropic", "bedrock", "vertex", "foundry"];
const ANTHROPIC_MODES: AuthMode[] = ["apiKey", "authToken", "subscription", "helper"];

/** Mirrors core::providers::secret_field — whether a secret input is shown. */
function needsSecret(kind: ProviderKind, authMode: AuthMode | null): boolean {
  if (kind === "anthropic") return authMode === "apiKey" || authMode === "authToken";
  return kind === "bedrock" || kind === "foundry";
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

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

function ProfileForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
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
        <select
          class={inputClass}
          value={form.kind}
          onChange={(e) => {
            const kind = (e.target as HTMLSelectElement).value as ProviderKind;
            set({ kind, authMode: kind === "anthropic" ? (form.authMode ?? "apiKey") : null });
          }}
        >
          {KINDS.map((k) => (
            <option value={k}>{k}</option>
          ))}
        </select>
      </label>
      {form.kind === "anthropic" && (
        <label class="flex flex-col gap-1 text-xs text-neutral-500">
          {t("providers.authMode")}
          <select
            class={inputClass}
            value={form.authMode ?? "apiKey"}
            onChange={(e) => set({ authMode: (e.target as HTMLSelectElement).value as AuthMode })}
          >
            {ANTHROPIC_MODES.map((m) => (
              <option value={m}>{m}</option>
            ))}
          </select>
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
      <div class="flex gap-2 pt-1">
        <Button onClick={onSave}>{t("detail.save")}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("providers.cancel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Global Providers manager (the app's own credential feature). Profiles live in
 * the desktop's own profiles.json; secrets go to the OS keychain. Not a scoped
 * panel — opened from the pinned sidebar entry.
 */
export function ProvidersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setProfiles(await invoke("list_profiles"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open) {
      setForm(null);
      void refresh();
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [open]);

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

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      class="m-auto w-[min(90vw,560px)] rounded-lg bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div class="flex max-h-[80vh] flex-col">
        <header class="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 class="text-sm font-semibold">🔑 {t("providers.title")}</h2>
          <button
            class="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
            onClick={() => ref.current?.close()}
          >
            ✕
          </button>
        </header>
        <div class="flex-1 overflow-auto p-4">
          {error && <div class="mb-2 text-sm text-red-500">{error}</div>}
          {form ? (
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={() => void save()}
              onCancel={() => setForm(null)}
            />
          ) : (
            <>
              {profiles.length === 0 && (
                <div class="py-4 text-sm text-neutral-400">{t("providers.empty")}</div>
              )}
              <ul class="flex flex-col gap-1">
                {profiles.map((p) => {
                  const missing = !p.hasSecret && needsSecret(p.kind, p.authMode ?? null);
                  return (
                    <li
                      key={p.id}
                      class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium">{p.name}</div>
                        <div class="truncate text-xs text-neutral-500">
                          {p.kind}
                          {p.authMode ? ` · ${p.authMode}` : ""}
                          {missing ? ` · ${t("providers.credentialMissing")}` : ""}
                        </div>
                      </div>
                      <button
                        class="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
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
                        class="text-xs text-neutral-400 hover:text-red-500"
                        onClick={() => void remove(p)}
                      >
                        {t("detail.delete")}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Button class="mt-3" onClick={() => setForm({ ...EMPTY })}>
                ➕ {t("providers.new")}
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
