import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useGatewayConnection } from "../hooks/GatewayContext";
import type { WebSocketMessage } from "../utils/websocket";

interface ChannelAccount {
  accountId: string;
  name?: string;
  enabled?: boolean;
  connected?: boolean;
  running?: boolean;
  lastError?: string;
}

interface ChannelInfo {
  id: string;
  label: string;
  accounts: ChannelAccount[];
}

export function Channels() {
  const { connected, sendRpc, onMessage } = useGatewayConnection();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) return;
    const unsub = onMessage((data: WebSocketMessage) => {
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
    sendRpc("channels.status", {});
    return unsub;
  }, [connected, sendRpc, onMessage]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">聊天平台</h2>
          <Link
            to="/settings"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            配置频道
          </Link>
        </div>

        {loading && <p className="text-sm text-gray-500">加载中...</p>}

        {!loading && channels.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">暂无已配置的聊天平台</p>
            <p className="mt-2 text-xs text-gray-400">
              前往{" "}
              <Link to="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">
                设置
              </Link>{" "}
              配置飞书、QQ 或微信
            </p>
          </div>
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
                  {a.lastError && (
                    <span className="text-xs text-red-500" title={a.lastError}>
                      错误
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
