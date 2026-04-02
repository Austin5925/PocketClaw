import type { OpenClawConfig, ModelProvider } from "../types";

const API_BASE = "/api";

export async function loadConfig(): Promise<OpenClawConfig> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error("Failed to load config");
  return res.json() as Promise<OpenClawConfig>;
}

export async function saveConfig(config: OpenClawConfig): Promise<void> {
  const res = await fetch(`${API_BASE}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config, null, 2),
  });
  if (!res.ok) throw new Error("Failed to save config");
}

export async function checkHealth(): Promise<{ ui: string; gateway: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json() as Promise<{ ui: string; gateway: string }>;
}

export async function getVersion(): Promise<{ version: string }> {
  const res = await fetch(`${API_BASE}/version`);
  if (!res.ok) throw new Error("Failed to get version");
  return res.json() as Promise<{ version: string }>;
}

/**
 * Map model prefix (from model string like "moonshot/kimi-k2.5") to the config
 * key where the API key is stored.  Most providers use the same prefix, but
 * Kimi stores its key under "kimi" while models start with "moonshot/", and
 * GLM stores under "glm" while models start with "zhipu/".
 */
const MODEL_PREFIX_TO_CONFIG_KEY: Record<string, string> = {
  moonshot: "kimi",
  zhipu: "glm",
  volcengine: "doubao",
  google: "gemini",
  modelstudio: "qwen",
};

export function getProviderConfigKey(model: string): string {
  const prefix = model.split("/")[0] ?? "";
  return MODEL_PREFIX_TO_CONFIG_KEY[prefix] ?? prefix;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "minimax",
    name: "MiniMax",
    description: "推荐，编程能力强大",
    models: [
      "minimax/MiniMax-M2.7",
      "minimax/MiniMax-M2.7-highspeed",
      "minimax/MiniMax-M2.5",
      "minimax/MiniMax-M2.1",
    ],
    recommended: true,
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "国内老牌，性价比极高",
    models: ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner"],
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "kimi",
    name: "Kimi (月之暗面)",
    description: "超强上下文，K2.5 思考较深回复稍慢属正常",
    models: ["moonshot/kimi-k2.5", "moonshot/kimi-k2-turbo-preview"],
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "qwen",
    name: "通义千问",
    description: "阿里出品，免费额度充足",
    models: ["modelstudio/qwen3.5-plus", "modelstudio/qwen3-max", "modelstudio/qwen-turbo"],
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    description: "清华系，编程能力很强",
    models: ["zhipu/glm-5.1", "zhipu/glm-5", "zhipu/glm-5-turbo", "zhipu/glm-4.5-air"],
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "doubao",
    name: "豆包 (火山引擎)",
    description: "火山引擎方舟平台，Seed 2.0 旗舰",
    models: [
      "volcengine/doubao-seed-2-0-pro-260215",
      "volcengine/doubao-seed-2-0-lite-260215",
      "volcengine/doubao-seed-2-0-mini-260215",
    ],
    apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    description: "推理能力强，需海外 API 或中转站",
    models: [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-haiku-4-5",
    ],
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    supportsBaseUrl: true,
    defaultBaseUrl: "https://api.anthropic.com",
  },
  {
    id: "openai",
    name: "GPT (OpenAI)",
    description: "通用能力强，需海外 API 或中转站",
    models: ["openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-4o-mini"],
    apiKeyUrl: "https://platform.openai.com/api-keys",
    supportsBaseUrl: true,
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    description: "多模态（图文视频），需海外网络或中转站",
    models: [
      "google/gemini-3.1-pro-preview",
      "google/gemini-3-flash-preview",
      "google/gemini-3.1-flash-lite-preview",
    ],
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    supportsBaseUrl: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
];
