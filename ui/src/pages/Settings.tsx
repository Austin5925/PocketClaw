import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { UpdateChecker } from "../components/UpdateChecker";
import { useConfig } from "../hooks/useConfig";
import { useGatewayConnection } from "../hooks/GatewayContext";
import { useTheme } from "../hooks/useTheme";
import { showToast } from "../components/Toast";
import { getProviderConfigKey, MODEL_PROVIDERS } from "../utils/config";
import type { ModelProvider, OpenClawConfig } from "../types";

/* ------------------------------------------------------------------ */
/*  Channel card types & component                                    */
/* ------------------------------------------------------------------ */

interface ChannelFieldDef {
  key: string;
  label: string;
  type: "text" | "password";
}

interface ChannelDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  fields: ChannelFieldDef[];
  tutorialUrl?: string;
  experimental?: boolean;
  experimentalNote?: string;
}

const CHANNEL_DEFS: ChannelDef[] = [
  {
    id: "feishu",
    name: "飞书",
    icon: "\uD83D\uDC26",
    description: "飞书机器人，支持 WebSocket（无需公网）",
    fields: [
      { key: "appId", label: "App ID", type: "text" },
      { key: "appSecret", label: "App Secret", type: "password" },
    ],
    tutorialUrl: "https://open.feishu.cn",
  },
  {
    id: "qqbot",
    name: "QQ 机器人",
    icon: "\uD83D\uDC27",
    description: "QQ 官方机器人平台",
    fields: [
      { key: "appId", label: "App ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", type: "password" },
    ],
    tutorialUrl: "https://q.qq.com",
  },
  {
    id: "openclaw-weixin",
    name: "微信",
    icon: "\uD83D\uDCAC",
    description: "微信 ClawBot 官方插件（扫码登录，无需公网）",
    fields: [],
    tutorialUrl: "https://weixin.qq.com",
    experimental: true,
    experimentalNote:
      "微信 ClawBot 为腾讯官方插件，需 iOS 微信 8.0.70+。启用后请在 OpenClaw 控制台 (18789) 完成扫码配对。",
  },
];

interface ChannelCardProps {
  channel: ChannelDef;
  config: Record<string, unknown> | null;
  onSave: (channelId: string, values: Record<string, string>) => void;
  saving: boolean;
}

function ChannelCard({ channel, config, onSave, saving }: ChannelCardProps) {
  const channelCfg = (config?.channels as Record<string, Record<string, unknown>> | undefined)?.[
    channel.id
  ];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  const isConfigured = (() => {
    if (!channelCfg) return false;
    if (channel.fields.length === 0) return Boolean(channelCfg.enabled);
    return channel.fields.every((f) => Boolean(channelCfg[f.key]));
  })();

  const hasInput = (() => {
    if (channel.fields.length === 0) return true;
    return channel.fields.some((f) => Boolean(fieldValues[f.key]?.trim()));
  })();

  const handleSave = () => {
    if (channel.fields.length === 0) {
      onSave(channel.id, {});
    } else {
      const values: Record<string, string> = {};
      for (const f of channel.fields) {
        const v = fieldValues[f.key]?.trim();
        if (v) values[f.key] = v;
      }
      onSave(channel.id, values);
    }
    setFieldValues({});
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{channel.icon}</span>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">{channel.name}</h4>
          {channel.experimental && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              实验性功能
            </span>
          )}
          {isConfigured ? (
            <span className="text-lg text-green-500" title="已配置">
              &#x2705;
            </span>
          ) : (
            <span className="text-lg text-yellow-500" title="未配置">
              &#x26A0;&#xFE0F;
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{channel.description}</p>

      {/* First step guidance */}
      {channel.tutorialUrl && channel.fields.length > 0 && (
        <p className="mb-2 text-xs text-indigo-600">
          第一步：
          <a
            href={channel.tutorialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            前往平台创建应用并获取凭证 →
          </a>
        </p>
      )}

      {/* Experimental notice */}
      {channel.experimentalNote && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {channel.experimentalNote}
        </div>
      )}

      {/* Field inputs */}
      {channel.fields.map((field) => {
        const isVisible = visibility[field.key] ?? false;
        return (
          <div key={field.key} className="mb-2">
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {field.label}
            </label>
            <div className="relative">
              <input
                type={field.type === "password" && !isVisible ? "password" : "text"}
                value={fieldValues[field.key] ?? ""}
                onChange={(e) =>
                  setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={
                  channelCfg?.[field.key] ? "已配置，重新输入以更新" : `请输入 ${field.label}`
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 font-mono text-sm transition-colors focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
              />
              {field.type === "password" && (
                <button
                  type="button"
                  onClick={() => setVisibility((prev) => ({ ...prev, [field.key]: !isVisible }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                >
                  {isVisible ? "隐藏" : "显示"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer: Save + tutorial link */}
      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={handleSave}
          disabled={(!hasInput && channel.fields.length > 0) || saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving
            ? "..."
            : channel.fields.length === 0
              ? isConfigured
                ? "已启用"
                : "启用"
              : "保存"}
        </button>
        {channel.tutorialUrl && (
          <a
            href={channel.tutorialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            查看教程 &rarr;
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-provider card state                                           */
/* ------------------------------------------------------------------ */

type ValidationStatus = "idle" | "validating" | "success" | "error";

interface ProviderCardState {
  apiKey: string;
  saving: boolean;
  validationStatus: ValidationStatus;
}

const DOMESTIC_IDS = ["minimax", "deepseek", "kimi", "qwen", "glm", "doubao"];

function isDomestic(id: string): boolean {
  return DOMESTIC_IDS.includes(id);
}

/* ------------------------------------------------------------------ */
/*  ProviderCard                                                      */
/* ------------------------------------------------------------------ */

interface ProviderCardProps {
  provider: ModelProvider;
  isActive: boolean;
  hasSavedKey: boolean;
  cardState: ProviderCardState;
  onApiKeyChange: (key: string) => void;
  onSave: () => void;
  onValidate: () => void;
  onSetDefault: () => void;
}

function ProviderCard({
  provider,
  isActive,
  hasSavedKey,
  cardState,
  onApiKeyChange,
  onSave,
  onValidate,
  onSetDefault,
}: ProviderCardProps) {
  const [visible, setVisible] = useState(false);
  const { apiKey, saving, validationStatus } = cardState;

  const statusIndicator = (() => {
    if (validationStatus === "validating") {
      return (
        <svg className="h-5 w-5 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      );
    }
    if (validationStatus === "success") {
      return (
        <span className="text-lg text-green-500" title="验证通过">
          &#x2705;
        </span>
      );
    }
    if (validationStatus === "error") {
      return (
        <span className="text-lg text-red-500" title="验证失败">
          &#x274C;
        </span>
      );
    }
    // idle — show saved vs not-saved
    if (hasSavedKey) {
      return (
        <span className="text-lg text-green-500" title="已配置">
          &#x2705;
        </span>
      );
    }
    return (
      <span className="text-lg text-yellow-500" title="未配置">
        &#x26A0;&#xFE0F;
      </span>
    );
  })();

  return (
    <div
      className={`rounded-2xl border bg-white p-5 transition-colors dark:border-gray-700 dark:bg-gray-800 ${
        isActive
          ? "border-l-4 border-l-indigo-500 border-t-gray-200 border-r-gray-200 border-b-gray-200"
          : "border-gray-200"
      }`}
    >
      {/* Header row */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">{provider.name}</h4>
          {provider.recommended && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              推荐
            </span>
          )}
          {isActive && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
              当前使用
            </span>
          )}
          {["anthropic", "openai", "gemini"].includes(provider.id) && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              需海外网络
            </span>
          )}
          {statusIndicator}
        </div>
        {!isActive && (
          <button
            onClick={onSetDefault}
            className="rounded-lg px-3 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
          >
            设为默认
          </button>
        )}
      </div>

      {/* Description */}
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{provider.description}</p>

      {/* API Key input row */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={hasSavedKey ? "已配置，重新输入以更新" : "sk-xxxxxxxxxxxxxxxx"}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 font-mono text-sm transition-colors focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-600 dark:hover:text-gray-200"
          >
            {visible ? "隐藏" : "显示"}
          </button>
        </div>
        <button
          onClick={onValidate}
          disabled={!apiKey || validationStatus === "validating"}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          验证
        </button>
        <button
          onClick={onSave}
          disabled={!apiKey || saving}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? "..." : "保存"}
        </button>
      </div>

      {/* Footer: API key link + model list */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        {provider.apiKeyUrl && (
          <a
            href={provider.apiKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            获取 API Key &rarr;
          </a>
        )}
        <span className="truncate">
          模型: {provider.models.map((m) => m.split("/")[1]).join(", ")}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings page                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  ProxyInput — HTTPS_PROXY setting for overseas models               */
/* ------------------------------------------------------------------ */

function ProxyInput({
  config,
  updateConfig,
}: {
  config: OpenClawConfig | null;
  updateConfig: (u: Partial<OpenClawConfig>) => Promise<void>;
}) {
  const current = (config as Record<string, unknown> | null)?.proxy as
    | Record<string, string>
    | undefined;
  const [value, setValue] = useState(current?.httpsProxy ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({ proxy: { httpsProxy: value.trim() } } as Partial<OpenClawConfig>);
      showToast("代理设置已保存，请重启口袋龙虾生效", "success");
    } catch {
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://127.0.0.1:7890"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          autoComplete="off"
        />
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? "..." : "保存"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        留空则使用系统代理。使用 Clash/V2Ray 等工具时填入本地代理地址。
      </p>
    </>
  );
}

type SettingsTab = "apikeys" | "channels" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "apikeys", label: "模型 API Key" },
  { id: "channels", label: "频道接入" },
  { id: "about", label: "关于与更新" },
];

export function Settings() {
  const { config, updateConfig, loading } = useConfig();
  const { sendRpc } = useGatewayConnection();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("apikeys");

  // Per-provider local state: keyed by provider.id
  const [cardStates, setCardStates] = useState<Record<string, ProviderCardState>>({});

  const getCardState = useCallback(
    (id: string): ProviderCardState =>
      cardStates[id] ?? { apiKey: "", saving: false, validationStatus: "idle" as const },
    [cardStates],
  );

  const patchCard = useCallback(
    (id: string, patch: Partial<ProviderCardState>) => {
      setCardStates((prev) => ({
        ...prev,
        [id]: { ...getCardState(id), ...patch },
      }));
    },
    [getCardState],
  );

  /* Determine which provider the current model belongs to */
  const activeModel = config?.agent?.model ?? "";
  const activeConfigKey = activeModel ? getProviderConfigKey(activeModel) : "";

  /** Check whether a provider has a saved (possibly masked) API key in config */
  const hasSavedKey = useCallback(
    (provider: ModelProvider): boolean => {
      if (!config) return false;
      const cfgKey = provider.id;
      const providerCfg = config[cfgKey] as Record<string, unknown> | undefined;
      return Boolean(providerCfg?.apiKey);
    },
    [config],
  );

  /* ---- Handlers ---- */

  const handleSave = useCallback(
    async (provider: ModelProvider) => {
      const state = getCardState(provider.id);
      if (!state.apiKey) return;
      patchCard(provider.id, { saving: true });
      try {
        await updateConfig({
          [provider.id]: { apiKey: state.apiKey },
        });
        sendRpc("secrets.reload", {});
        showToast(`${provider.name} API Key 已保存`, "success");
        patchCard(provider.id, { saving: false, apiKey: "", validationStatus: "idle" });
      } catch {
        showToast("保存失败", "error");
        patchCard(provider.id, { saving: false });
      }
    },
    [getCardState, patchCard, updateConfig, sendRpc],
  );

  const handleValidate = useCallback(
    async (provider: ModelProvider) => {
      const state = getCardState(provider.id);
      if (!state.apiKey) return;
      patchCard(provider.id, { validationStatus: "validating" });
      try {
        const modelPrefix = provider.models[0]?.split("/")[0] ?? "";
        const res = await fetch("/api/validate-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: modelPrefix,
            apiKey: state.apiKey,
            model: provider.models[0] ?? "",
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { valid?: boolean };
          patchCard(provider.id, {
            validationStatus: data.valid ? "success" : "error",
          });
          const isOverseas = ["anthropic", "openai", "gemini"].includes(provider.id);
          showToast(
            data.valid
              ? `${provider.name} 验证通过`
              : isOverseas
                ? `${provider.name} 验证失败（请确认海外网络/代理已开启）`
                : `${provider.name} 验证失败`,
            data.valid ? "success" : "error",
          );
        } else {
          const isOverseas = ["anthropic", "openai", "gemini"].includes(provider.id);
          patchCard(provider.id, { validationStatus: "error" });
          showToast(
            isOverseas
              ? `${provider.name} 验证失败（请确认海外网络/代理已开启）`
              : `${provider.name} 验证失败`,
            "error",
          );
        }
      } catch {
        patchCard(provider.id, { validationStatus: "error" });
        showToast("验证请求失败", "error");
      }
    },
    [getCardState, patchCard],
  );

  const handleSetDefault = useCallback(
    async (provider: ModelProvider) => {
      try {
        await updateConfig({
          agent: { ...config?.agent, model: provider.models[0] ?? "" },
        });
        sendRpc("secrets.reload", {});
        showToast(`已切换到 ${provider.name}`, "success");
      } catch {
        showToast("切换失败", "error");
      }
    },
    [config, updateConfig, sendRpc],
  );

  /* ---- Channel handlers ---- */
  const [channelSaving, setChannelSaving] = useState(false);

  const handleChannelSave = useCallback(
    async (channelId: string, values: Record<string, string>) => {
      setChannelSaving(true);
      try {
        const channelData: Record<string, unknown> = { enabled: true, ...values };
        // Feishu defaults to dmPolicy="pairing" which requires CLI approval.
        // Override to "open" for portable USB users who can't run CLI commands.
        if (channelId === "feishu") {
          channelData.dmPolicy = channelData.dmPolicy ?? "open";
        }
        await updateConfig({
          channels: { [channelId]: channelData },
        } as Partial<OpenClawConfig>);
        sendRpc("secrets.reload", {});
        const def = CHANNEL_DEFS.find((c) => c.id === channelId);
        showToast(`${def?.name ?? channelId} 已保存`, "success");
      } catch {
        showToast("保存失败", "error");
      } finally {
        setChannelSaving(false);
      }
    },
    [updateConfig, sendRpc],
  );

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">加载中...</p>
      </div>
    );
  }

  const domesticProviders = MODEL_PROVIDERS.filter((p) => isDomestic(p.id));
  const overseasProviders = MODEL_PROVIDERS.filter((p) => !isDomestic(p.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
      <div className="flex min-h-screen">
        {/* ---- Left sidebar tabs ---- */}
        <aside className="flex w-48 shrink-0 flex-col border-r border-gray-200 bg-white/80 backdrop-blur dark:border-gray-700 dark:bg-gray-800/80">
          <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
            <Link
              to="/"
              className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">设置</h1>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ---- Main content ---- */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-2xl space-y-6">
            {/* ======== Tab: 模型 API Key ======== */}
            {activeTab === "apikeys" && (
              <>
                <section>
                  <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                    国内模型
                  </h2>
                  <div className="space-y-4">
                    {domesticProviders.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        isActive={activeConfigKey === provider.id}
                        hasSavedKey={hasSavedKey(provider)}
                        cardState={getCardState(provider.id)}
                        onApiKeyChange={(key) => patchCard(provider.id, { apiKey: key })}
                        onSave={() => void handleSave(provider)}
                        onValidate={() => void handleValidate(provider)}
                        onSetDefault={() => void handleSetDefault(provider)}
                      />
                    ))}
                  </div>
                </section>
                <section>
                  <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                    海外模型（需海外网络）
                  </h2>
                  <div className="space-y-4">
                    {overseasProviders.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        isActive={activeConfigKey === provider.id}
                        hasSavedKey={hasSavedKey(provider)}
                        cardState={getCardState(provider.id)}
                        onApiKeyChange={(key) => patchCard(provider.id, { apiKey: key })}
                        onSave={() => void handleSave(provider)}
                        onValidate={() => void handleValidate(provider)}
                        onSetDefault={() => void handleSetDefault(provider)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* ======== Tab: 频道接入 ======== */}
            {activeTab === "channels" && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
                  聊天平台
                </h2>
                <div className="space-y-4">
                  {CHANNEL_DEFS.map((ch) => (
                    <ChannelCard
                      key={ch.id}
                      channel={ch}
                      config={config as Record<string, unknown> | null}
                      onSave={(channelId, values) => void handleChannelSave(channelId, values)}
                      saving={channelSaving}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ======== Tab: 关于与更新 ======== */}
            {activeTab === "about" && (
              <>
                {/* Theme */}
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

                {/* Proxy settings for overseas models */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">代理设置</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    使用海外模型（GPT、Claude、Gemini）需要代理。填写后重启生效。
                  </p>
                  <ProxyInput config={config} updateConfig={updateConfig} />
                </div>

                {/* Update */}
                <UpdateChecker />

                {/* About */}
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">关于</h3>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p>口袋龙虾 — 便携 AI 助手</p>
                    <p>基于 OpenClaw (MIT) 构建</p>
                    <div className="pt-2">
                      <a
                        href="mailto:ausdina@proton.me"
                        className="text-indigo-600 hover:underline"
                      >
                        反馈建议
                      </a>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
