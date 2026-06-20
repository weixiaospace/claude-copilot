import { Monitor, Moon, Sun } from "lucide-preact";
import { theme, setTheme, type Theme } from "../lib/theme";
import { t } from "../lib/i18n";
import { Segmented } from "./ui/Segmented";

/** Tri-state theme control (light / follow system / dark). */
export function ThemeToggle() {
  return (
    <Segmented
      value={theme.value}
      onChange={(v: Theme) => void setTheme(v)}
      options={[
        { value: "light", label: <Sun size={16} />, title: t("theme.light") },
        { value: "system", label: <Monitor size={16} />, title: t("theme.system") },
        { value: "dark", label: <Moon size={16} />, title: t("theme.dark") },
      ]}
    />
  );
}
