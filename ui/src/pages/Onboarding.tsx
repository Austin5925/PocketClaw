import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ModelSelector } from "../components/ModelSelector";
import { ApiKeyInput } from "../components/ApiKeyInput";
import { Logo } from "../components/Logo";
import { useConfig } from "../hooks/useConfig";
import { useGatewayConnection } from "../hooks/GatewayContext";
import { MODEL_PROVIDERS, getProviderConfigKey } from "../utils/config";

interface ChannelConfig {
  feishu?: { enabled: boolean; appId: string; appSecret: string };
  qqbot?: { enabled: boolean; appId: string; clientSecret: string };
  "openclaw-weixin"?: { enabled: boolean };
}

const TOTAL_STEPS = 4;

export function Onboarding() {
  const navigate = useNavigate();
  const { updateConfig } = useConfig();
  const { sendRpc } = useGatewayConnection();
  const [step, setStep] = useState(1);
  const [model, setModel] = useState("minimax/MiniMax-M2.7");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 3 — channel config state
  const [channels, setChannels] = useState<ChannelConfig>({});
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const handleValidateAndNext = async () => {
    if (!apiKey.trim()) {
      setError("请输入 API Key");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const modelPrefix = model.split("/")[0] ?? "";

      const validateRes = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: modelPrefix,
          apiKey: apiKey.trim(),
          model,
        }),
      });
      if (validateRes.ok) {
        const result = (await validateRes.json()) as {
          valid: boolean;
          error?: string;
        };
        if (!result.valid) {
          setError(result.error ?? "API Key 无效，请检查后重试");
          setSaving(false);
          return;
        }
      }

      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "验证失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async (skipChannels: boolean) => {
    setSaving(true);
    setError(null);

    try {
      const configKey = getProviderConfigKey(model);

      const configUpdates: Record<string, unknown> = {
        agent: { model },
        [configKey]: { apiKey: apiKey.trim() },
      };

      if (!skipChannels) {
        configUpdates.channels = channels;
      }

      await updateConfig(configUpdates);

      sendRpc("secrets.reload", {});

      await new Promise((r) => setTimeout(r, 500));

      setStep(4);

      // Brief pause on step 4 then navigate
      await new Promise((r) => setTimeout(r, 1200));
      setSaving(false);
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存配置失败");
      setSaving(false);
    }
  };

  const toggleChannel = (
    channel: "feishu" | "qqbot" | "openclaw-weixin",
    field: string,
    value: string | boolean,
  ) => {
    setChannels((prev) => {
      const existing = prev[channel] ?? getChannelDefaults(channel);
      return {
        ...prev,
        [channel]: { ...existing, [field]: value },
      };
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-6 flex gap-2 px-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-indigo-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
            <div className="flex flex-col items-center py-8">
              <Logo size={80} className="mb-6" />
              <h1 className="text-3xl font-bold text-gray-900">欢迎使用口袋龙虾</h1>
              <p className="mt-2 text-gray-500">便携 AI 助手，插上即用</p>
              <button
                onClick={() => setStep(2)}
                className="mt-10 w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                开始设置
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Model + API Key */}
        {step === 2 && (
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">选择 AI 模型</h2>
            <p className="mb-4 text-sm text-gray-500">选择模型提供商并输入 API Key</p>
            <ModelSelector value={model} onChange={setModel} />

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-gray-700">输入 API Key</h3>
              <ApiKeyInput value={apiKey} onChange={setApiKey} />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              {(() => {
                const configKey = getProviderConfigKey(model);
                const provider = MODEL_PROVIDERS.find((p) => p.id === configKey);
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
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-xl border-2 border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                上一步
              </button>
              <button
                onClick={() => void handleValidateAndNext()}
                disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "验证中..." : "下一步"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Connect Channels (optional) */}
        {step === 3 && (
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">连接聊天平台（可选）</h2>
            <p className="mb-6 text-sm text-gray-500">连接后可在聊天软件中直接使用 AI</p>

            <div className="space-y-3">
              {/* Feishu */}
              <ChannelCard
                name="飞书"
                icon={<FeishuIcon className="h-6 w-6 shrink-0 text-blue-500" />}
                expanded={expandedChannel === "feishu"}
                onToggle={() => setExpandedChannel(expandedChannel === "feishu" ? null : "feishu")}
              >
                <input
                  type="text"
                  placeholder="App ID"
                  value={channels.feishu?.appId ?? ""}
                  onChange={(e) => toggleChannel("feishu", "appId", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="App Secret"
                  value={channels.feishu?.appSecret ?? ""}
                  onChange={(e) => toggleChannel("feishu", "appSecret", e.target.value)}
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <a
                  href="https://open.feishu.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-indigo-600 hover:underline"
                >
                  查看飞书机器人配置教程 →
                </a>
              </ChannelCard>

              {/* QQ */}
              <ChannelCard
                name="QQ"
                icon={<QQIcon className="h-6 w-6 shrink-0 text-sky-500" />}
                expanded={expandedChannel === "qqbot"}
                onToggle={() => setExpandedChannel(expandedChannel === "qqbot" ? null : "qqbot")}
              >
                <input
                  type="text"
                  placeholder="App ID"
                  value={channels.qqbot?.appId ?? ""}
                  onChange={(e) => toggleChannel("qqbot", "appId", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  value={channels.qqbot?.clientSecret ?? ""}
                  onChange={(e) => toggleChannel("qqbot", "clientSecret", e.target.value)}
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <a
                  href="https://q.qq.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-indigo-600 hover:underline"
                >
                  查看 QQ 机器人配置教程 →
                </a>
              </ChannelCard>

              {/* WeChat */}
              <ChannelCard
                name="微信"
                icon={<WeChatIcon className="h-6 w-6 shrink-0 text-green-500" />}
                badge="实验性功能"
                expanded={expandedChannel === "openclaw-weixin"}
                onToggle={() =>
                  setExpandedChannel(
                    expandedChannel === "openclaw-weixin" ? null : "openclaw-weixin",
                  )
                }
              >
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={channels["openclaw-weixin"]?.enabled ?? false}
                    onChange={(e) => toggleChannel("openclaw-weixin", "enabled", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  启用微信 ClawBot（需在 OpenClaw 控制台扫码配对）
                </label>
              </ChannelCard>
            </div>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => void handleFinish(true)}
                disabled={saving}
                className="flex-1 rounded-xl border-2 border-gray-200 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                跳过
              </button>
              <button
                onClick={() => void handleFinish(false)}
                disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "完成设置"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Complete */}
        {step === 4 && (
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
            <div className="flex flex-col items-center py-8">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">设置完成</h2>
              <p className="mt-2 text-gray-500">正在进入聊天界面...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Collapsible channel configuration card */
function ChannelCard({
  name,
  icon,
  badge,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  icon: React.ReactNode;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-gray-200 transition-colors">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4">
        {icon}
        <span className="font-medium text-gray-900">{name}</span>
        {badge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {badge}
          </span>
        )}
        <svg
          className={`ml-auto h-5 w-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="border-t border-gray-100 px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

/** Helper to produce sensible defaults for new channel entries */
function getChannelDefaults(
  channel: "feishu" | "qqbot" | "openclaw-weixin",
): NonNullable<ChannelConfig[typeof channel]> {
  switch (channel) {
    case "feishu":
      return { enabled: true, appId: "", appSecret: "" };
    case "qqbot":
      return { enabled: true, appId: "", clientSecret: "" };
    case "openclaw-weixin":
      return { enabled: false };
  }
}

/** Simple Feishu icon (bird silhouette) */
function FeishuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 3.5c3.5 2 5.5 5.5 6 9.5 2-3 5-5.5 9-6.5-3 4-4 8.5-3 13.5-3-2-5.5-3.5-8.5-3.5S3 19 1 20.5c1-4.5 1.5-9.5 3.5-17z" />
    </svg>
  );
}

/** Simple QQ icon (penguin silhouette) */
function QQIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.5 2 6 4.5 6 7.5V10c-1 1.5-2 4-1 6 .5 1 1 1.5 1.5 2-.5 1-1 2-.5 2.5s1.5 0 2.5-.5c.5.5 1.5 1 3.5 1s3-.5 3.5-1c1 .5 2 1 2.5.5s0-1.5-.5-2.5c.5-.5 1-1 1.5-2 1-2 0-4.5-1-6V7.5C18 4.5 15.5 2 12 2z" />
    </svg>
  );
}

/** Simple WeChat icon (chat bubbles) */
function WeChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 4C5.1 4 2 6.5 2 9.6c0 1.7.9 3.2 2.3 4.2l-.6 1.8 2.1-1.1c.7.2 1.4.3 2.2.3.3 0 .7 0 1-.1-.2-.6-.3-1.1-.3-1.7 0-3.4 3.2-6.2 7.3-6.2.3 0 .6 0 .9.1C15.7 5 12.6 4 9 4zm10.1 4.8c-3.2 0-5.8 2.2-5.8 4.9s2.6 4.9 5.8 4.9c.6 0 1.2-.1 1.7-.2l1.7.9-.5-1.5c1.1-.9 1.8-2.1 1.8-3.5.2-2.9-2-5.5-6.7-5.5z" />
    </svg>
  );
}
