import { useEffect, useState } from "preact/hooks";
import { Play } from "lucide-preact";
import { toast } from "../lib/toast";
import { useFsRefresh } from "../lib/useFsRefresh";
import type { Session } from "../types/Session";
import { invoke } from "../lib/ipc";
import { t } from "../lib/i18n";
import { PanelHeader } from "./PanelHeader";
import { Button } from "./ui/button";
import { Loading } from "./ui/Loading";

/** Project sessions: list transcripts and resume / start one in a terminal. */
export function SessionsPanel({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh(initial = false) {
    if (initial) setLoading(true);
    try {
      setSessions(await invoke("list_sessions", { projectId }));
    } catch (e) {
      toast.error(String(e));
    } finally {
      if (initial) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh(true);
    // eslint-disable-next-line
  }, [projectId]);
  useFsRefresh(refresh);

  async function open(tool: string, sessionId: string | null) {
    try {
      await invoke("open_terminal", { projectId, tool, sessionId });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div class="flex h-full flex-col">
      <PanelHeader
        onRefresh={() => refresh()}
        extra={
          <>
            <Button onClick={() => void open("claude", null)}>
              <Play size={15} class="mr-1" />
              {t("sessions.new")}
            </Button>
            <Button variant="ghost" onClick={() => void open("happy", null)}>
              happy
            </Button>
          </>
        }
      />

      <div class="min-h-0 flex-1 overflow-auto px-3 pb-4">
        {loading ? (
          <Loading />
        ) : sessions.length === 0 ? (
          <div class="px-3 py-6 text-sm text-neutral-400">{t("sessions.empty")}</div>
        ) : (
          <ul class="flex flex-col gap-0.5">
            {sessions.map((s) => {
              const ts = new Date(s.modified_ms).toLocaleString();
              return (
                <li
                  key={s.id}
                  class="flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{s.preview ?? s.id}</div>
                    <div class="truncate text-xs text-neutral-400" title={ts}>
                      {ts}
                    </div>
                  </div>
                  <button
                    class="shrink-0 rounded px-2 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    title={s.id}
                    onClick={() => void open("claude", s.id)}
                  >
                    {t("sessions.resume")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
