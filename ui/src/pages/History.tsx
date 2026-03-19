import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface SessionRow {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number;
  totalTokens?: number;
  model?: string;
  status?: string;
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    ws.onStatus((isConnected) => {
      if (isConnected) {
        ws.sendRpc("sessions.list", {
          limit: 50,
          includeDerivedTitles: true,
          includeLastMessage: true,
        });
      }
    });
    ws.onMessage((data: WebSocketMessage) => {
      if (data.type === "res" && (data as Record<string, unknown>).ok) {
        const p = data.payload as Record<string, unknown> | undefined;
        if (p?.sessions && Array.isArray(p.sessions)) {
          setSessions(
            (p.sessions as Array<Record<string, unknown>>).map((s) => ({
              key: s.key as string,
              displayName: s.displayName as string | undefined,
              derivedTitle: s.derivedTitle as string | undefined,
              lastMessagePreview: s.lastMessagePreview as string | undefined,
              updatedAt: s.updatedAt as number | undefined,
              totalTokens: s.totalTokens as number | undefined,
              model: s.model as string | undefined,
              status: s.status as string | undefined,
            })),
          );
          setLoading(false);
        }
      }
    });
    ws.connect();
    return () => ws.disconnect();
  }, []);

  const handleClick = (key: string) => {
    // Navigate to chat with this session key (via URL param or state)
    navigate("/?session=" + encodeURIComponent(key));
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">历史记录</h2>
        {loading && <p className="text-sm text-gray-500">加载中...</p>}
        {!loading && sessions.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">暂无对话记录</p>
        )}
        <div className="space-y-2">
          {sessions.map((s) => {
            const title = s.derivedTitle ?? s.displayName ?? s.key.split(":").pop() ?? "对话";
            return (
              <button
                key={s.key}
                onClick={() => handleClick(s.key)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
                  <span className="text-xs text-gray-400">{formatTime(s.updatedAt)}</span>
                </div>
                {s.lastMessagePreview && (
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                    {s.lastMessagePreview}
                  </p>
                )}
                <div className="mt-1 flex gap-3 text-[10px] text-gray-400">
                  {s.model && <span>{s.model.split("/").pop()}</span>}
                  {s.totalTokens !== undefined && s.totalTokens > 0 && (
                    <span>{s.totalTokens.toLocaleString()} tokens</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
