import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { StatusCard } from "../components/StatusCard";
import { useConfig } from "../hooks/useConfig";
import { useGateway } from "../hooks/useGateway";

export function Dashboard() {
  const navigate = useNavigate();
  const { config, loading, isConfigured } = useConfig();
  const { connected, connectionError } = useGateway();
  const [showApiKeyAlert, setShowApiKeyAlert] = useState(false);

  useEffect(() => {
    if (!loading && !isConfigured) {
      navigate("/onboarding");
    }
  }, [loading, isConfigured, navigate]);

  const modelName = config?.agent?.model?.split("/").pop() ?? "未配置";
  const providerId = config?.agent?.model?.split("/")[0] ?? "";
  const providerConfig = config?.[providerId] as Record<string, unknown> | undefined;
  const hasApiKey = Boolean(providerConfig?.apiKey);

  const gatewayLabel = connected ? "已连接" : connectionError || "连接中...";
  const gatewayStatus: "online" | "offline" | "warning" = connected
    ? "online"
    : connectionError
      ? "offline"
      : "warning";

  const handleChatClick = (e: React.MouseEvent) => {
    if (!hasApiKey) {
      e.preventDefault();
      setShowApiKeyAlert(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">PocketClaw</h1>
          <Link
            to="/settings"
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="设置"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <Link to="/settings" className="block">
            <StatusCard
              icon="🤖"
              label="当前模型"
              value={modelName}
              status={hasApiKey ? "online" : "warning"}
            />
            {!hasApiKey && (
              <p className="mt-1 text-center text-xs text-amber-600">点击配置 API Key</p>
            )}
          </Link>
          <StatusCard
            icon="💬"
            label="Gateway 状态"
            value={gatewayLabel}
            status={gatewayStatus}
          />
        </div>

        <div className="space-y-3">
          <Link
            to="/chat"
            onClick={handleChatClick}
            className="flex items-center justify-between rounded-2xl bg-indigo-600 p-5 text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
          >
            <span className="text-lg font-semibold">开始聊天</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>

          <a
            href={`http://localhost:18789`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-2xl border-2 border-gray-200 bg-white p-5 text-gray-700 transition-all hover:border-gray-300 hover:shadow-md"
          >
            <span className="font-medium">切换到高级模式（原生界面）</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>

        {showApiKeyAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-2 text-lg font-semibold text-gray-900">尚未配置 API Key</h3>
              <p className="mb-4 text-sm text-gray-600">
                需要先配置 AI 模型的 API Key 才能开始聊天。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowApiKeyAlert(false)}
                  className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  取消
                </button>
                <Link
                  to="/settings"
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  去配置
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
