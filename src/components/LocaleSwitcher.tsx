import { locale, setLocale, type Locale } from "../lib/i18n";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "zh-cn", label: "中文" },
];

export function LocaleSwitcher() {
  return (
    <div class="inline-flex rounded-md border border-neutral-200 p-0.5 text-xs dark:border-neutral-800">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          class={
            "rounded px-2 py-0.5 transition-colors " +
            (locale.value === o.value
              ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")
          }
          onClick={() => void setLocale(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
