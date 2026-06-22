import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { t } from "./i18n";
import { toast } from "./toast";

/**
 * Check for an update. On a new version, prompt (native dialog) to install +
 * relaunch — that confirmation is a real decision, so it stays modal. A manual
 * check (`silent === false`) surfaces progress + "up to date" / errors as
 * non-blocking toasts; the startup check (`silent`) stays quiet unless an update
 * is found. Endpoint + pubkey live in `tauri.conf.json#plugins.updater`.
 */
export async function runUpdateCheck(silent: boolean): Promise<void> {
  const checking = silent ? null : toast.loading(t("update.checking"));
  let update;
  try {
    update = await check();
  } catch (e) {
    if (checking !== null) {
      toast.dismiss(checking);
      toast.error(`${t("update.checkFailed")}: ${e}`);
    }
    return;
  }
  if (!update) {
    if (checking !== null) {
      toast.dismiss(checking);
      toast.success(t("update.upToDate"));
    }
    return;
  }
  if (checking !== null) toast.dismiss(checking);
  const ok = await ask(t("update.found", update.version), {
    title: t("update.title"),
    kind: "info",
  });
  if (!ok) return;
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    toast.error(`${t("update.installFailed")}: ${e}`);
  }
}
