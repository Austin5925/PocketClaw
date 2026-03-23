import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ModelSelector } from "../components/ModelSelector";
import { ApiKeyInput } from "../components/ApiKeyInput";
import { UpdateChecker } from "../components/UpdateChecker";
import { useConfig } from "../hooks/useConfig";
import { useGatewayConnection } from "../hooks/GatewayContext";
import { useTheme } from "../hooks/useTheme";
import { showToast } from "../components/Toast";
import { getProviderConfigKey } from "../utils/config";

export function Settings() {
  const { config, updateConfig, loading } = useConfig();
  const { sendRpc } = useGatewayConnection();
  const { theme, setTheme } = useTheme();
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (config) {
      setModel(config.agent?.model ?? "");
      const configKey = getProviderConfigKey(config.agent?.model ?? "");
      const providerConfig = config[configKey];
      if (providerConfig && typeof providerConfig === "object" && "apiKey" in providerConfig) {
        const raw = String(providerConfig.apiKey);
        setApiKey(raw.startsWith("****") ? "" : raw);
      } else {
        setApiKey("");
      }
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const configKey = getProviderConfigKey(model);
      await updateConfig({
        agent: { ...config?.agent, model },
        [configKey]: { apiKey },
      });
      // Refresh gateway auth store (auth-profiles.json is cached in memory)
      sendRpc("secrets.reload", {});
      showToast("设置已保存", "success");
    } catch {
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">AI 模型</h3>
            <ModelSelector value={model} onChange={setModel} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">API Key</h3>
            <ApiKeyInput value={apiKey} onChange={setApiKey} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">外观</h3>
            <div className="flex gap-2">
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    theme === t
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {t === "system" ? "跟随系统" : t === "light" ? "浅色" : "深色"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">聊天平台</h3>
            <p className="text-sm text-gray-500">
              连接 QQ、飞书、微信等聊天平台，请使用
              <a
                href="http://localhost:18789"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-indigo-600 hover:underline"
              >
                高级模式
              </a>
              进行配置
            </p>
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>

          <UpdateChecker />

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">关于</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p>口袋龙虾 — 便携 AI 助手</p>
              <p>基于 OpenClaw (MIT) 构建</p>
              <div className="flex gap-3 pt-2">
                <a
                  href="https://github.com/Austin5925/PocketClaw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  GitHub
                </a>
                <a
                  href="https://github.com/Austin5925/PocketClaw/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  反馈
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
