import { useEffect, useState } from "react";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface SkillEntry {
  name: string;
  description: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  bundled: boolean;
  homepage?: string;
}

export function Skills() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    ws.onStatus((isConnected) => {
      if (isConnected) {
        ws.sendRpc("skills.status", {});
      }
    });
    ws.onMessage((data: WebSocketMessage) => {
      if (data.type === "res" && (data as Record<string, unknown>).ok) {
        const p = data.payload as Record<string, unknown> | undefined;
        if (p?.skills && Array.isArray(p.skills)) {
          setSkills(
            (p.skills as Array<Record<string, unknown>>).map((s) => ({
              name: s.name as string,
              description: s.description as string,
              emoji: s.emoji as string | undefined,
              eligible: s.eligible as boolean,
              disabled: s.disabled as boolean,
              bundled: s.bundled as boolean,
              homepage: s.homepage as string | undefined,
            })),
          );
          setLoading(false);
        }
      }
    });
    ws.connect();
    return () => ws.disconnect();
  }, []);

  const enabledSkills = skills.filter((s) => s.eligible && !s.disabled);
  const disabledSkills = skills.filter((s) => !s.eligible || s.disabled);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Skills</h2>
        {loading && <p className="text-sm text-gray-500">加载中...</p>}

        {!loading && enabledSkills.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
              已启用 ({enabledSkills.length})
            </p>
            <div className="mb-6 space-y-2">
              {enabledSkills.map((s) => (
                <div
                  key={s.name}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="mt-0.5 text-lg">{s.emoji ?? "🧩"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {s.name}
                      </p>
                      {s.bundled && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700">
                          内置
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {s.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && disabledSkills.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
              未启用 ({disabledSkills.length})
            </p>
            <div className="space-y-2">
              {disabledSkills.map((s) => (
                <div
                  key={s.name}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 opacity-60 dark:border-gray-800 dark:bg-gray-900"
                >
                  <span className="mt-0.5 text-lg">{s.emoji ?? "🧩"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          管理 Skills 请使用{" "}
          <a
            href="http://localhost:18789"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            OpenClaw 高级模式
          </a>
        </p>
      </div>
    </div>
  );
}
