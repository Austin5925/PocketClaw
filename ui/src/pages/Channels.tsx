import { useEffect, useState } from "react";
import { GatewayWebSocket, type WebSocketMessage } from "../utils/websocket";

interface ChannelAccount {
  accountId: string;
  name?: string;
  enabled?: boolean;
  connected?: boolean;
  running?: boolean;
  lastError?: string;
  dmPolicy?: string;
}

interface ChannelInfo {
  id: string;
  label: string;
  accounts: ChannelAccount[];
}

export function Channels() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ws = new GatewayWebSocket();
    ws.onStatus((isConnected) => {
      if (isConnected) {
        ws.sendRpc("channels.status", {});
      }
    });
    ws.onMessage((data: WebSocketMessage) => {
      if (data.type === "res" && (data as Record<string, unknown>).ok) {
        const p = data.payload as Record<string, unknown> | undefined;
        if (p?.channelOrder && p?.channels) {
          const order = p.channelOrder as string[];
          const labels = (p.channelLabels ?? {}) as Record<string, string>;
          const accts = (p.channelAccounts ?? {}) as Record<string, ChannelAccount[]>;
          setChannels(
            order.map((id) => ({
              id,
              label: labels[id] ?? id,
              accounts: accts[id] ?? [],
            })),
          );
          setLoading(false);
        }
      }
    });
    ws.connect();
    return () => ws.disconnect();
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Channels</h2>
        {loading && <p className="text-sm text-gray-500">加载中...</p>}
        {!loading && channels.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">暂无已配置的通道</p>
        )}
        <div className="space-y-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{ch.label}</h3>
                <span className="text-xs text-gray-400">{ch.id}</span>
              </div>
              {ch.accounts.length === 0 && <p className="mt-2 text-xs text-gray-400">未配置账号</p>}
              {ch.accounts.map((a) => (
                <div key={a.accountId} className="mt-2 flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${a.connected ? "bg-emerald-500" : a.running ? "bg-amber-500" : "bg-gray-300"}`}
                  />
                  <span className="text-gray-700 dark:text-gray-300">{a.name ?? a.accountId}</span>
                  <span className="text-xs text-gray-400">
                    {a.connected ? "已连接" : a.running ? "运行中" : "未连接"}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          通道配置请使用{" "}
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
