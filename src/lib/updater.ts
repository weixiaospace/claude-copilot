import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { t } from "./i18n";

/**
 * Check for an update. On a new version, prompt (native dialog) to install +
 * relaunch. `silent` (startup) stays quiet on no-update / errors; the manual
 * check surfaces both. Endpoint + pubkey live in `tauri.conf.json#plugins.updater`.
 */
export async function runUpdateCheck(silent: boolean): Promise<void> {
  let update;
  try {
    update = await check();
  } catch (e) {
    if (!silent) await message(`${t("update.checkFailed")}: ${e}`, { kind: "error" });
    return;
  }
  if (!update) {
    if (!silent) await message(t("update.upToDate"));
    return;
  }
  const ok = await ask(t("update.found", update.version), {
    title: t("update.title"),
    kind: "info",
  });
  if (!ok) return;
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    await message(`${t("update.installFailed")}: ${e}`, { kind: "error" });
  }
}
