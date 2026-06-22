import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import { invoke } from "../lib/ipc";
import { providersTick } from "../lib/signals";
import { t } from "../lib/i18n";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import { PanelHeader } from "./PanelHeader";
import { Segmented } from "./ui/Segmented";
import { Select } from "./ui/Select";
import { Button } from "./ui/button";
import { Loading } from "./ui/Loading";

type Doc = Record<string, unknown>;
type Layer = "user" | "project" | "local";

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

/** A scalar setting rendered as a single form row. */
type FieldSpec =
  | { key: string; kind: "text"; placeholder?: string }
  | { key: string; kind: "number"; placeholder?: string }
  | { key: string; kind: "bool" }
  | { key: string; kind: "enum"; options: string[] };

type Section = { title: string; fields: FieldSpec[] };

// Curated set of safe, useful settings.json keys (verified against the current
// Claude Code schema). Security-sensitive keys (env, apiKeyHelper, AWS/GCP
// scripts), admin/managed-only keys, and deprecated keys are intentionally left
// to the raw-JSON editor; hooks/output-style/permission-lists live in their own
// panels or below.
const SECTIONS: Section[] = [
  {
    title: "settings.sec.model",
    fields: [
      { key: "model", kind: "text", placeholder: "opus / sonnet / …" },
      { key: "effortLevel", kind: "enum", options: ["low", "medium", "high", "xhigh"] },
      { key: "alwaysThinkingEnabled", kind: "bool" },
      { key: "language", kind: "text", placeholder: "english / 中文 / 日本語" },
    ],
  },
  {
    title: "settings.sec.interface",
    fields: [
      { key: "editorMode", kind: "enum", options: ["normal", "vim"] },
      { key: "autoScrollEnabled", kind: "bool" },
      { key: "spinnerTipsEnabled", kind: "bool" },
      { key: "prefersReducedMotion", kind: "bool" },
    ],
  },
  {
    title: "settings.sec.session",
    fields: [
      { key: "cleanupPeriodDays", kind: "number", placeholder: "30" },
      { key: "fileCheckpointingEnabled", kind: "bool" },
      { key: "autoMemoryEnabled", kind: "bool" },
      { key: "respectGitignore", kind: "bool" },
    ],
  },
  {
    title: "settings.sec.notif",
    fields: [
      {
        key: "preferredNotifChannel",
        kind: "enum",
        options: [
          "auto",
          "terminal_bell",
          "iterm2",
          "iterm2_with_bell",
          "kitty",
          "ghostty",
          "notifications_disabled",
        ],
      },
      { key: "agentPushNotifEnabled", kind: "bool" },
      { key: "inputNeededNotifEnabled", kind: "bool" },
    ],
  },
  {
    title: "settings.sec.updates",
    fields: [{ key: "autoUpdatesChannel", kind: "enum", options: ["stable", "latest"] }],
  },
];

const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"];

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

function asObject(v: unknown): Doc {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Doc) : {};
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** One settings row: label on the left, the right control by `kind`. A blank /
 *  "inherit" value clears the key so it falls back to the inherited default. */
function SettingRow({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown | undefined) => void;
}) {
  let control;
  if (spec.kind === "bool") {
    const cur = value === true ? "on" : value === false ? "off" : "inherit";
    control = (
      <Segmented
        value={cur}
        onChange={(v) => onChange(v === "on" ? true : v === "off" ? false : undefined)}
        options={[
          { value: "inherit", label: t("settings.inherit") },
          { value: "on", label: t("settings.on") },
          { value: "off", label: t("settings.off") },
        ]}
      />
    );
  } else if (spec.kind === "enum") {
    const cur = typeof value === "string" ? value : "";
    control = (
      <Select
        value={cur}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value || undefined)}
      >
        <option value="">{t("settings.inherit")}</option>
        {spec.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  } else if (spec.kind === "number") {
    const cur = typeof value === "number" ? String(value) : "";
    control = (
      <input
        type="number"
        class={inputClass + " max-w-[8rem]"}
        value={cur}
        placeholder={spec.placeholder}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          const n = Number(raw);
          onChange(raw === "" || Number.isNaN(n) ? undefined : n);
        }}
      />
    );
  } else {
    const cur = typeof value === "string" ? value : "";
    control = (
      <input
        class={inputClass}
        value={cur}
        placeholder={spec.placeholder}
        onInput={(e) => onChange((e.target as HTMLInputElement).value || undefined)}
      />
    );
  }
  return (
    <div class="flex items-center gap-4 py-2">
      <span class="w-56 shrink-0 pr-2 text-sm">{t(`settings.field.${spec.key}`)}</span>
      <div class="min-w-0 flex-1">{control}</div>
    </div>
  );
}

function StringListEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div class="flex flex-col gap-1">
      <div class="text-xs font-medium text-neutral-500">{label}</div>
      {values.length > 0 && (
        <div class="flex flex-wrap gap-1">
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              class="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800"
            >
              <span class="font-mono">{v}</span>
              <button
                class="text-neutral-400 hover:text-red-500"
                aria-label={t("detail.delete")}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        class={inputClass}
        value={draft}
        placeholder={t("settings.addPlaceholder")}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onChange([...values, draft.trim()]);
            setDraft("");
          }
        }}
      />
    </div>
  );
}

export function SettingsPanel({ scope }: { scope: Scope }) {
  const ref = toScopeRef(scope);
  const layers: Layer[] = scope.kind === "user" ? ["user"] : ["project", "local"];
  const [layer, setLayer] = useState<Layer>(layers[0]);
  const [doc, setDoc] = useState<Doc>({});
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    invoke("read_settings", { scope: ref, layer })
      .then((d) => {
        setDoc(asObject(d));
        setRaw(false);
        setJsonError(null);
        setStatus(null);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // Re-read when an activation elsewhere rewrites this scope's env block.
    // eslint-disable-next-line
  }, [layer, scope.id, providersTick.value]);
  useFsRefresh(reload);

  const permissions = asObject(doc.permissions);

  /** Set/clear a top-level key (undefined → delete, so it inherits). */
  function setKey(key: string, value: unknown | undefined) {
    setDoc((d) => {
      const next: Doc = { ...d };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  /** Set/clear a `permissions.*` key, pruning the object when it goes empty. */
  function setPermKey(key: string, value: unknown | undefined) {
    setDoc((d) => {
      const perms: Doc = { ...asObject(d.permissions) };
      if (value === undefined) delete perms[key];
      else perms[key] = value;
      const next: Doc = { ...d };
      if (Object.keys(perms).length) next.permissions = perms;
      else delete next.permissions;
      return next;
    });
  }

  function toggleRaw() {
    if (!raw) {
      setRawText(JSON.stringify(doc, null, 2));
      setRaw(true);
    } else {
      try {
        setDoc(asObject(JSON.parse(rawText)));
        setRaw(false);
        setJsonError(null);
      } catch (e) {
        setJsonError(`${t("settings.invalidJson")}: ${e}`);
      }
    }
  }

  async function save() {
    let toWrite = doc;
    if (raw) {
      try {
        const parsed = JSON.parse(rawText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        toWrite = parsed;
        setDoc(parsed);
      } catch (e) {
        setJsonError(`${t("settings.invalidJson")}: ${e}`);
        return;
      }
    }
    setSaving(true);
    try {
      await invoke("write_settings", { scope: ref, layer, value: toWrite });
      setJsonError(null);
      setStatus(t("settings.saved"));
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        extra={
          layers.length > 1 ? (
            <Segmented
              value={layer}
              onChange={setLayer}
              options={layers.map((l) => ({ value: l, label: t(`settings.layer.${l}`) }))}
            />
          ) : undefined
        }
        actions={
          <>
            <Button variant="ghost" onClick={toggleRaw}>
              {raw ? t("settings.form") : t("settings.raw")}
            </Button>
            <Button onClick={() => void save()} disabled={!!jsonError || saving}>
              {t("detail.save")}
            </Button>
          </>
        }
      />

      {jsonError && <div class="px-6 pb-1 text-sm text-red-500">{jsonError}</div>}
      {status && <div class="px-6 pb-1 text-sm text-green-600">{status}</div>}

      <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <Loading />
        ) : raw ? (
          <textarea
            class="h-full min-h-[20rem] w-full resize-none rounded border border-neutral-200 bg-transparent p-2 font-mono text-xs dark:border-neutral-700"
            value={rawText}
            onInput={(e) => setRawText((e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <div class="flex flex-col gap-6">
            {SECTIONS.map((sec) => (
              <section key={sec.title} class="flex flex-col">
                <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {t(sec.title)}
                </h3>
                <div class="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800/70">
                  {sec.fields.map((f) => (
                    <SettingRow
                      key={f.key}
                      spec={f}
                      value={doc[f.key]}
                      onChange={(v) => setKey(f.key, v)}
                    />
                  ))}
                </div>
              </section>
            ))}

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {t("settings.sec.permissions")}
              </h3>
              <SettingRow
                spec={{ key: "defaultMode", kind: "enum", options: PERMISSION_MODES }}
                value={permissions.defaultMode}
                onChange={(v) => setPermKey("defaultMode", v)}
              />
              <StringListEditor
                label={t("settings.permissionsAllow")}
                values={asStringArray(permissions.allow)}
                onChange={(v) => setPermKey("allow", v.length ? v : undefined)}
              />
              <StringListEditor
                label={t("settings.permissionsAsk")}
                values={asStringArray(permissions.ask)}
                onChange={(v) => setPermKey("ask", v.length ? v : undefined)}
              />
              <StringListEditor
                label={t("settings.permissionsDeny")}
                values={asStringArray(permissions.deny)}
                onChange={(v) => setPermKey("deny", v.length ? v : undefined)}
              />
              <StringListEditor
                label={t("settings.additionalDirs")}
                values={asStringArray(permissions.additionalDirectories)}
                onChange={(v) => setPermKey("additionalDirectories", v.length ? v : undefined)}
              />
            </section>

            <p class="text-xs text-neutral-400">{t("settings.rawHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
