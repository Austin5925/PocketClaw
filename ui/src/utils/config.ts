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

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "minimax",
    name: "MiniMax",
    description: "国产首选，中文能力强",
    models: ["minimax/MiniMax-M2.5"],
    recommended: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "编程首选，性价比高",
    models: ["deepseek/deepseek-chat", "deepseek/deepseek-coder"],
  },
  {
    id: "kimi",
    name: "Kimi (月之暗面)",
    description: "长文档理解，中文优化",
    models: ["moonshot/moonshot-v1-128k"],
  },
  {
    id: "qwen",
    name: "通义千问",
    description: "阿里出品，免费额度大",
    models: ["qwen/qwen-max", "qwen/qwen-plus"],
  },
  {
    id: "glm",
    name: "智谱 GLM",
    description: "国产大模型，性能均衡",
    models: ["zhipu/glm-4-plus", "zhipu/glm-4"],
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    description: "推理能力强，需海外 API",
    models: ["anthropic/claude-sonnet-4-20250514", "anthropic/claude-haiku-4-5-20251001"],
  },
  {
    id: "openai",
    name: "GPT (OpenAI)",
    description: "通用能力强，需海外 API",
    models: ["openai/gpt-4o", "openai/gpt-4o-mini"],
  },
];
