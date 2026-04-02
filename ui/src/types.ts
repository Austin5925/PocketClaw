export interface OpenClawConfig {
  agent?: {
    model?: string;
  };
  gateway?: {
    port?: number;
    host?: string;
  };
  webchat?: {
    enabled?: boolean;
  };
  log?: {
    level?: string;
  };
  [key: string]: unknown;
}

export interface ModelProvider {
  id: string;
  name: string;
  description: string;
  models: string[];
  recommended?: boolean;
  apiKeyUrl?: string;
  /** Show a custom Base URL input (for relay/proxy services). */
  supportsBaseUrl?: boolean;
  /** Default baseUrl shown as placeholder when no custom URL is set. */
  defaultBaseUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  pending?: boolean;
}

export interface GatewayStatus {
  connected: boolean;
  gatewayReachable: boolean;
  error?: string;
}

export interface VersionInfo {
  current: string;
  latest?: string;
  updateAvailable: boolean;
  openclawVersion?: string;
}

export interface HealthResponse {
  ui: string;
  gateway: string;
  gatewayResponse?: string;
}
