import { useState, useEffect, useCallback } from "react";
import type { OpenClawConfig } from "../types";
import { loadConfig, saveConfig, getProviderConfigKey } from "../utils/config";

function deepMerge(
  base: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(updates)) {
    const baseVal = base[key];
    const updateVal = updates[key];
    if (
      updateVal !== null &&
      typeof updateVal === "object" &&
      !Array.isArray(updateVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        updateVal as Record<string, unknown>,
      );
    } else {
      result[key] = updateVal;
    }
  }
  return result;
}

interface UseConfigReturn {
  config: OpenClawConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (updates: Partial<OpenClawConfig>) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  reload: () => Promise<void>;
  isConfigured: boolean;
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadConfig();
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateConfig = useCallback(
    async (updates: Partial<OpenClawConfig>) => {
      const merged = deepMerge(
        (config ?? {}) as Record<string, unknown>,
        updates as Record<string, unknown>,
      ) as OpenClawConfig;
      await saveConfig(merged);
      setConfig(merged);
    },
    [config],
  );

  const setModel = useCallback(
    async (model: string) => {
      await updateConfig({
        agent: { ...config?.agent, model },
      });
    },
    [config, updateConfig],
  );

  // Must have both model AND a provider API key (masked "****xxxx" counts —
  // the server holds the real key; GET /api/config always masks for security).
  const configKey = config?.agent?.model ? getProviderConfigKey(config.agent.model) : "";
  const providerCfg = configKey
    ? (config?.[configKey] as Record<string, unknown> | undefined)
    : undefined;
  const isConfigured = Boolean(config?.agent?.model && providerCfg?.apiKey);

  return { config, loading, error, updateConfig, setModel, reload, isConfigured };
}
