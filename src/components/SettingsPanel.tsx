import { useEffect, useState } from "preact/hooks";
import { X } from "lucide-preact";
import type { Scope } from "../types/Scope";
import type { ScopeRef } from "../types/ScopeRef";
import { invoke } from "../lib/ipc";
import { providersTick } from "../lib/signals";
import { t } from "../lib/i18n";
import { PanelHeader } from "./PanelHeader";
import { Segmented } from "./ui/Segmented";
import { Button } from "./ui/button";

type Doc = Record<string, unknown>;
type Layer = "user" | "project" | "local";

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm dark:border-neutral-700";

function toScopeRef(scope: Scope): ScopeRef {
  return scope.kind === "user" ? { kind: "user" } : { kind: "project", id: scope.id };
}

function asObject(v: unknown): Doc {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Doc) : {};
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    invoke("read_settings", { scope: ref, layer })
      .then((d) => {
        setDoc(asObject(d));
        setRaw(false);
        setError(null);
        setStatus(null);
      })
      .catch((e) => setError(String(e)));
    // Re-read when an activation elsewhere rewrites this scope's env block.
    // eslint-disable-next-line
  }, [layer, scope.id, providersTick.value]);

  const permissions = asObject(doc.permissions);
  const setPerm = (key: string, vals: string[]) =>
    setDoc({ ...doc, permissions: { ...permissions, [key]: vals } });

  function setModel(v: string) {
    const next = { ...doc };
    if (v) next.model = v;
    else delete next.model;
    setDoc(next);
  }

  function toggleRaw() {
    if (!raw) {
      setRawText(JSON.stringify(doc, null, 2));
      setRaw(true);
    } else {
      try {
        setDoc(asObject(JSON.parse(rawText)));
        setRaw(false);
        setError(null);
      } catch (e) {
        setError(`${t("settings.invalidJson")}: ${e}`);
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
        setError(`${t("settings.invalidJson")}: ${e}`);
        return;
      }
    }
    try {
      await invoke("write_settings", { scope: ref, layer, value: toWrite });
      setError(null);
      setStatus(t("settings.saved"));
    } catch (e) {
      setError(String(e));
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
            <Button onClick={() => void save()}>{t("detail.save")}</Button>
          </>
        }
      />

      {error && <div class="px-6 pb-1 text-sm text-red-500">{error}</div>}
      {status && <div class="px-6 pb-1 text-sm text-green-600">{status}</div>}

      <div class="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {raw ? (
          <textarea
            class="h-full min-h-[20rem] w-full resize-none rounded border border-neutral-200 bg-transparent p-2 font-mono text-xs dark:border-neutral-700"
            value={rawText}
            onInput={(e) => setRawText((e.target as HTMLTextAreaElement).value)}
          />
        ) : (
          <div class="flex max-w-2xl flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium text-neutral-500">{t("settings.model")}</span>
              <input
                class={inputClass}
                value={typeof doc.model === "string" ? doc.model : ""}
                placeholder="(inherit)"
                onInput={(e) => setModel((e.target as HTMLInputElement).value)}
              />
            </label>
            <StringListEditor
              label={t("settings.permissionsAllow")}
              values={asStringArray(permissions.allow)}
              onChange={(v) => setPerm("allow", v)}
            />
            <StringListEditor
              label={t("settings.permissionsAsk")}
              values={asStringArray(permissions.ask)}
              onChange={(v) => setPerm("ask", v)}
            />
            <StringListEditor
              label={t("settings.permissionsDeny")}
              values={asStringArray(permissions.deny)}
              onChange={(v) => setPerm("deny", v)}
            />
            <StringListEditor
              label={t("settings.additionalDirs")}
              values={asStringArray(permissions.additionalDirectories)}
              onChange={(v) => setPerm("additionalDirectories", v)}
            />
            <p class="text-xs text-neutral-400">{t("settings.rawHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
