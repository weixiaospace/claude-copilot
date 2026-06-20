import { locale, setLocale, type Locale } from "../lib/i18n";
import { Segmented } from "./ui/Segmented";

export function LocaleSwitcher() {
  return (
    <Segmented
      value={locale.value}
      onChange={(v: Locale) => void setLocale(v)}
      options={[
        { value: "en", label: "EN" },
        { value: "zh-cn", label: "中文" },
      ]}
    />
  );
}
