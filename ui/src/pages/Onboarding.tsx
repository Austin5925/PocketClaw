import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ModelSelector } from "../components/ModelSelector";
import { ApiKeyInput } from "../components/ApiKeyInput";
import { useConfig } from "../hooks/useConfig";
import { MODEL_PROVIDERS } from "../utils/config";

export function Onboarding() {
  const navigate = useNavigate();
  const { updateConfig } = useConfig();
  const [step, setStep] = useState(1);
  const [model, setModel] = useState("minimax/MiniMax-M2.7");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (!apiKey.trim()) {
      setError("请输入 API Key");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const providerId = model.split("/")[0] ?? "";

      // Validate API Key via server proxy (avoids browser CORS)
      const validateRes = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: apiKey.trim(), model }),
      });
      if (validateRes.ok) {
        const result = (await validateRes.json()) as { valid: boolean; error?: string };
        if (!result.valid) {
          setError(result.error ?? "API Key 无效，请检查后重试");
          setSaving(false);
          return;
        }
      }

      await updateConfig({
        agent: { model },
        [providerId]: { apiKey: apiKey.trim() },
      });
      navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">欢迎使用 PocketClaw</h1>
          <p className="mt-2 text-gray-500">便携 AI 助手，插上即用</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
          <div className="mb-6 flex gap-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-indigo-500" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">选择 AI 模型</h2>
              <p className="mb-4 text-sm text-gray-500">选择你想使用的 AI 模型提供商</p>
              <ModelSelector value={model} onChange={setModel} />
              <button
                onClick={() => setStep(2)}
                className="mt-6 w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                下一步
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">输入 API Key</h2>
              <p className="mb-4 text-sm text-gray-500">从模型提供商网站获取你的 API Key</p>
              <ApiKeyInput value={apiKey} onChange={setApiKey} />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              {(() => {
                const providerId = model.split("/")[0] ?? "";
                const provider = MODEL_PROVIDERS.find((p) => p.id === providerId);
                const url = provider?.apiKeyUrl;
                return url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                  >
                    前往 {provider?.name ?? "提供商"} 获取 API Key
                  </a>
                ) : null;
              })()}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-xl border-2 border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  上一步
                </button>
                <button
                  onClick={() => void handleFinish()}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "开始使用"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
