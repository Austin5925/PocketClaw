import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { UpdateChecker } from "../components/UpdateChecker";
import { useConfig } from "../hooks/useConfig";
import { getProviderConfigKey, MODEL_PROVIDERS } from "../utils/config";

const GATEWAY_URL = "http://localhost:18789";

/**
 * Landing page shown after onboarding is complete.
 * Never redirects or replaces the current page — all external links open in a new tab.
 */
export function PostSetup() {
  const { config } = useConfig();
  const [gatewayStatus, setGatewayStatus] = useState<"checking" | "online" | "offline">("checking");

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
        const res = await fetch(`${GATEWAY_URL}/health`, { cache: "no-store" });
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
            <div className="flex items-center justify-between">
              <span className="text-gray-600">AI 模型</span>
              <span className="font-medium text-gray-900">
                {providerName} / {modelDisplay}
              </span>
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
