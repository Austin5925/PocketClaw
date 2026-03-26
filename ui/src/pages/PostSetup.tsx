import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { showToast } from "../components/Toast";
import { UpdateChecker } from "../components/UpdateChecker";
import { useConfig } from "../hooks/useConfig";
import { getProviderConfigKey, MODEL_PROVIDERS } from "../utils/config";

const GATEWAY_URL = "http://localhost:18789";

/**
 * Landing page shown after onboarding is complete.
 * Never redirects or replaces the current page — all external links open in a new tab.
 */
export function PostSetup() {
  const { config, updateConfig } = useConfig();
  const [gatewayStatus, setGatewayStatus] = useState<"checking" | "online" | "offline">("checking");
  const [showModelPicker, setShowModelPicker] = useState(false);

  const currentModel = config?.agent?.model ?? "";
  const modelDisplay = currentModel.split("/").pop() ?? "未配置";
  const configKey = currentModel ? getProviderConfigKey(currentModel) : "";
  const providerName = MODEL_PROVIDERS.find((p) => p.id === configKey)?.name ?? configKey;
  const hasApiKey = Boolean(
    configKey && (config?.[configKey] as Record<string, unknown> | undefined)?.apiKey,
  );

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        // Use same-origin proxy to avoid CORS (direct fetch to :18789 is cross-origin)
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setGatewayStatus(res.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setGatewayStatus("offline");
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <Logo size={56} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">口袋龙虾</h1>
          <p className="mt-1 text-sm text-gray-500">设置已完成，可以开始使用了</p>
        </div>

        {/* Status card */}
        <div className="mb-6 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">当前配置</h2>
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">AI 模型</span>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {providerName} / {modelDisplay}
                  <svg
                    className={`h-4 w-4 transition-transform ${showModelPicker ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
              {showModelPicker && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
                  {MODEL_PROVIDERS.map((provider) => {
                    const provCfgKey = provider.id;
                    const provHasKey = Boolean(
                      (config?.[provCfgKey] as Record<string, unknown> | undefined)?.apiKey,
                    );
                    return (
                      <div key={provider.id}>
                        <div className="sticky top-0 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
                          {provider.name}
                          {!provHasKey && (
                            <span className="ml-1 text-amber-500">（未配置 Key）</span>
                          )}
                        </div>
                        {provider.models.map((model) => {
                          const isActive = model === currentModel;
                          const modelLabel = model.split("/").pop() ?? model;
                          return (
                            <button
                              key={model}
                              disabled={!provHasKey}
                              onClick={async () => {
                                try {
                                  await updateConfig({ agent: { ...config?.agent, model } });
                                  showToast(`已切换到 ${modelLabel}`, "success");
                                  setShowModelPicker(false);
                                } catch {
                                  showToast("切换失败", "error");
                                }
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                                isActive
                                  ? "bg-indigo-50 font-medium text-indigo-700"
                                  : provHasKey
                                    ? "text-gray-700 hover:bg-white"
                                    : "cursor-not-allowed text-gray-400"
                              }`}
                            >
                              <span>{modelLabel}</span>
                              {isActive && <span className="text-xs text-indigo-500">当前</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">API Key</span>
              <span className={`font-medium ${hasApiKey ? "text-green-600" : "text-amber-600"}`}>
                {hasApiKey ? "已配置" : "未配置"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">AI 引擎</span>
              <span
                className={`font-medium ${
                  gatewayStatus === "online"
                    ? "text-green-600"
                    : gatewayStatus === "checking"
                      ? "text-gray-400"
                      : "text-amber-600"
                }`}
              >
                {gatewayStatus === "online"
                  ? "已连接"
                  : gatewayStatus === "checking"
                    ? "检测中..."
                    : "未就绪"}
              </span>
            </div>
          </div>
        </div>

        {/* Hint when gateway is online but Control UI may not be built */}
        {gatewayStatus === "online" && (
          <p className="mb-2 text-center text-xs text-gray-400">
            如果 AI 界面显示 &quot;Control UI assets not found&quot;，请通过一键更新获取最新版本
          </p>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <a
            href={GATEWAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-2xl bg-indigo-600 p-5 text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
          >
            <span className="text-lg font-semibold">打开 AI 界面</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>

          <Link
            to="/settings"
            className="flex items-center justify-between rounded-2xl border-2 border-gray-200 bg-white p-5 text-gray-700 transition-all hover:border-gray-300 hover:shadow-md"
          >
            <span className="font-medium">设置</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>

          <p className="text-center text-xs text-gray-400">
            随时可以回到此页面修改 API Key 或频道配置
          </p>

          <Link
            to="/onboarding"
            className="block text-center text-sm text-gray-500 hover:text-indigo-600"
          >
            重新运行引导设置
          </Link>
        </div>

        {/* Update checker */}
        <div className="mt-8">
          <UpdateChecker />
        </div>
      </div>
    </div>
  );
}
