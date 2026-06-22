import { message } from "@tauri-apps/plugin-dialog";
import { t } from "./i18n";

/** Show a native error dialog. Use for all user-facing errors. */
export async function notifyError(error: unknown): Promise<void> {
  await message(String(error), { kind: "error", title: t("common.error") });
}

/** Show a native info dialog for successful operations. */
export async function notifySuccess(text: string): Promise<void> {
  await message(text, { kind: "info", title: t("common.success") });
}
