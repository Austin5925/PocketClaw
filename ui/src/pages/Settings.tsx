import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { UpdateChecker } from "../components/UpdateChecker";
import { useConfig } from "../hooks/useConfig";
import { useGatewayConnection } from "../hooks/GatewayContext";
import { useTheme } from "../hooks/useTheme";
import { showToast } from "../components/Toast";
import { getProviderConfigKey, MODEL_PROVIDERS } from "../utils/config";
import type { ModelProvider } from "../types";

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
        <svg
          className="h-5 w-5 animate-spin text-indigo-500"
          fill="none"
          viewBox="0 0 24 24"
        >
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
      return <span className="text-lg text-green-500" title="验证通过">&#x2705;</span>;
    }
    if (validationStatus === "error") {
      return <span className="text-lg text-red-500" title="验证失败">&#x274C;</span>;
    }
    // idle — show saved vs not-saved
    if (hasSavedKey) {
      return <span className="text-lg text-green-500" title="已配置">&#x2705;</span>;
    }
    return <span className="text-lg text-yellow-500" title="未配置">&#x26A0;&#xFE0F;</span>;
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
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
            {provider.name}
          </h4>
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
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {provider.description}
      </p>

      {/* API Key input row */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={hasSavedKey ? "已配置，重新输入以更新" : "sk-xxxxxxxxxxxxxxxx"}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 font-mono text-sm transition-colors focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            autoComplete="off"
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

export function Settings() {
  const { config, updateConfig, loading } = useConfig();
  const { sendRpc } = useGatewayConnection();
  const { theme, setTheme } = useTheme();

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
          showToast(
            data.valid ? `${provider.name} 验证通过` : `${provider.name} 验证失败`,
            data.valid ? "success" : "error",
          );
        } else {
          patchCard(provider.id, { validationStatus: "error" });
          showToast(`${provider.name} 验证失败`, "error");
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
        showToast(`已切换到 ${provider.name}`, "success");
      } catch {
        showToast("切换失败", "error");
      }
    },
    [config, updateConfig],
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">设置</h1>
        </div>

        <div className="space-y-6">
          {/* ---- Domestic providers ---- */}
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

          {/* ---- Overseas providers ---- */}
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

          {/* ---- Theme card ---- */}
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

          {/* ---- Chat platform card ---- */}
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

          {/* ---- Update checker ---- */}
          <UpdateChecker />

          {/* ---- About card ---- */}
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
        </div>
      </div>
    </div>
  );
}
