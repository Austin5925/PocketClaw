const http = require("http");
const fs = require("fs");
const path = require("path");
const { createProxyServer } = require("./ws-proxy");

const UI_PORT = parseInt(process.env.UI_PORT || "3210", 10);
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "18789", 10);
const GATEWAY_HOST = process.env.GATEWAY_HOST || "127.0.0.1";

const SCRIPT_DIR = __dirname;
const BASE_DIR = path.resolve(SCRIPT_DIR, "..");
const UI_DIR = path.join(BASE_DIR, "app", "ui", "dist");
const DATA_DIR = path.join(BASE_DIR, "data");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:* https://api.github.com https://pocketclawaus.oss-cn-shanghai.aliyuncs.com; font-src 'self'",
};

const SHARED_CONFIG = JSON.parse(
  fs.readFileSync(path.join(SCRIPT_DIR, "shared-config.json"), "utf-8"),
);
const KNOWN_PROVIDERS = SHARED_CONFIG.providers.map((p) => p.id);

// ── WeChat QR login ─────────────────────────────────────────────────────
const ILINK_BASE = "ilinkai.weixin.qq.com";
const QR_SESSION_TTL_MS = 5 * 60_000; // 5 minutes
// In-memory QR login sessions: sessionKey → { qrcode, qrcodeContent, startedAt, currentApiHost }
const activeQrSessions = new Map();

// ── PocketClaw AGENTS.md ────────────────────────────────────────────────
const POCKETCLAW_AGENTS_MD = `# 口袋龙虾 (PocketClaw)

你是"口袋龙虾"——一个运行在便携 U 盘上的 AI 助手。

## 运行环境

- 你运行在用户的 U 盘上，所有程序、技能和数据都存储在 U 盘中。
- 用户在不同电脑上插入 U 盘即可使用，无需安装任何软件。
- Node.js 运行时和 66 个常用 AI 技能已预装在 U 盘中。

## 与用户交互

- 大部分用户是非技术背景的普通人，请用通俗易懂的中文交流。
- 每一步操作都给出具体指引，不要跳过"显而易见"的步骤。
- 如果涉及设置或配置（模型选择、API Key、频道接入等），引导用户前往 http://localhost:3210/settings 操作。
- 如果用户需要使用高级功能或排查复杂问题，可以引导他们访问 http://localhost:18789（高级控制台）。

## 关于软件和工具

- U 盘中已预装了大部分常用工具和技能，在建议安装新软件前，先确认是否已有可用方案。
- 如果确实需要用户执行终端命令（如高级排错），请说明这是进阶操作，并给出每一步的详细解释和预期结果。一般情况下，优先推荐通过浏览器界面完成操作。
- 注意：U 盘环境是便携式的。安装到电脑本地的软件包在 U 盘移到另一台电脑后将不可用。如果需要安装，建议安装到 U 盘内的项目目录中。
`;

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    const headers = { "Content-Type": contentType, ...SECURITY_HEADERS };
    // Prevent browser from caching HTML (so updates take effect immediately)
    if (ext === ".html") {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    return false;
  }
  return true;
}

/** Write JSON response with security headers. */
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...SECURITY_HEADERS,
  });
  res.end(JSON.stringify(data));
}

// Build provider ID → OpenClaw provider name mapping from shared-config.json.
// Providers with an "openclawId" field use that; others default to their own "id".
const OPENCLAW_PROVIDER = Object.fromEntries(
  SHARED_CONFIG.providers
    .filter((p) => p.openclawId)
    .map((p) => [p.id, p.openclawId]),
);

/**
 * Write auth-profiles.json for the agent auth store.
 * Format verified from OpenClaw source: src/agents/auth-profiles/types.ts
 */
function syncAuthProfiles(config) {
  const profiles = {};
  for (const provider of KNOWN_PROVIDERS) {
    const apiKey = config[provider]?.apiKey;
    if (!apiKey) continue;
    const openclawProvider = OPENCLAW_PROVIDER[provider] || provider;
    const profileKey = `${openclawProvider}:default`;
    // Don't overwrite if already set by a higher-priority alias
    if (profiles[profileKey]) continue;
    profiles[profileKey] = {
      type: "api_key",
      provider: openclawProvider,
      key: apiKey,
    };
  }

  if (Object.keys(profiles).length === 0) return;

  const store = { version: 1, profiles };
  const agentDir = path.join(
    DATA_DIR,
    ".openclaw",
    ".openclaw",
    "agents",
    "main",
    "agent",
  );
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(agentDir, "auth-profiles.json"),
    JSON.stringify(store, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );
}

// Reverse mapping: OpenClaw provider name → UI config key.
// e.g. "moonshot" → "kimi" (so syncInternalConfig can find the API key).
const CONFIG_KEY_FOR_PROVIDER = Object.fromEntries(
  SHARED_CONFIG.providers
    .filter((p) => p.openclawId)
    .map((p) => [p.openclawId, p.id]),
);

/**
 * Sync model + all provider configs to OpenClaw's internal config.
 * API keys go through auth-profiles.json primarily, but also written here
 * as belt-and-suspenders. Provider entries must be COMPLETE (baseUrl, api, models)
 * to pass Zod strict validation.
 */
function syncInternalConfig(config, { updateModel = false } = {}) {
  const internalDir = path.join(DATA_DIR, ".openclaw", ".openclaw");
  const internalPath = path.join(internalDir, "openclaw.json");

  let internal = {};
  try {
    internal = JSON.parse(fs.readFileSync(internalPath, "utf-8"));
  } catch {
    // File doesn't exist yet, start fresh
  }

  // ── Cleanup stale keys from v1.2.28 ──────────────────────────────────────
  // v1.2.28 (commit aec812c) wrote browser/canvasHost/discovery/update directly
  // into openclaw.json. v1.2.29 stopped writing them but never cleaned existing
  // files. These keys cause Zod strict() validation failure → gateway ignores
  // the entire config → provider resolution fails → Kimi (and any non-default
  // model) silently produces zero chat events because the provider config is lost.
  // This is the root cause of the Kimi K2.5 non-response bug reported since v1.2.28.
  delete internal.browser;
  delete internal.canvasHost;
  delete internal.discovery;
  delete internal.update;

  // Local-only: no auth + no device identity checks
  if (!internal.gateway) internal.gateway = {};
  if (!internal.gateway.auth) internal.gateway.auth = {};
  internal.gateway.auth.mode = "none";
  if (!internal.gateway.controlUi) internal.gateway.controlUi = {};
  internal.gateway.controlUi.allowInsecureAuth = true;
  internal.gateway.controlUi.dangerouslyDisableDeviceAuth = true;

  // Model sync: only write agents.defaults.model when explicitly requested.
  // Previously this ran on EVERY PUT, overwriting whatever model the user
  // selected in the 18789 Control UI with whatever was in our user config.
  if (!internal.agents) internal.agents = {};
  if (!internal.agents.defaults) internal.agents.defaults = {};
  if (updateModel) {
    const model = config.agent?.model;
    if (model) {
      internal.agents.defaults.model = model;
    }
  }
  if (!internal.agents.defaults.model) {
    internal.agents.defaults.model = "minimax/MiniMax-M2.7";
  }

  // Disable heartbeat (visible "Read HEARTBEAT.md" every 30 min in 18789 chat).
  // heartbeat is part of agents.defaults which IS in the config schema.
  internal.agents.defaults.heartbeat = { every: "0" };

  // Disable extended thinking globally. Consumer users don't need thinking mode,
  // and some providers (moonshot) add significant latency when thinking is on.
  // If thinking is needed per-model, it can be set via 18789 Control UI.
  internal.agents.defaults.thinkingDefault = "off";

  // NOTE: browser, canvasHost, discovery.mdns, update.checkOnStart are NOT in
  // OpenClaw's config file Zod schema (they're CLI/runtime params). Writing them
  // to openclaw.json causes Zod strict() validation failure → gateway crash.
  // These are disabled via env vars in the gateway spawn call instead.

  // Explicitly set workspace path so OpenClaw finds ClawHub skills.
  // Without this, OpenClaw defaults to ~/.openclaw/workspace/ which
  // doesn't contain the bundled skills we installed to $OPENCLAW_HOME/workspace/.
  const workspacePath = path.join(DATA_DIR, ".openclaw", "workspace");
  internal.agents.defaults.workspace = workspacePath;

  // Write AGENTS.md with PocketClaw persona if not already customized by user.
  const agentsMdPath = path.join(workspacePath, "AGENTS.md");
  if (!fs.existsSync(agentsMdPath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(agentsMdPath, POCKETCLAW_AGENTS_MD, { encoding: "utf-8" });
  }

  // Write provider configs for all providers that have entries in shared-config.json.
  // This ensures OpenClaw knows the baseUrl/api/models for each provider.
  if (!internal.models) internal.models = {};
  if (!internal.models.providers) internal.models.providers = {};

  for (const [providerKey, providerCfg] of Object.entries(SHARED_CONFIG)) {
    if (providerKey === "providers") continue;
    if (!providerCfg.baseUrl) continue;

    // Resolve API key: check config under the UI provider ID
    const configKey = CONFIG_KEY_FOR_PROVIDER[providerKey] || providerKey;
    const apiKey = config[configKey]?.apiKey || config[providerKey]?.apiKey;

    const existing = internal.models.providers[providerKey] || {};

    // Relay model mapping: if user has a relayModelMap, use relay model IDs
    // instead of the default shared-config IDs so OpenClaw sends the correct
    // model name to the relay API (e.g. "anthropic/claude-sonnet-4.6" instead
    // of "claude-sonnet-4-6").
    const relayMap = config[configKey]?.relayModelMap || config[providerKey]?.relayModelMap;
    const sharedModels = Array.isArray(providerCfg.models) ? providerCfg.models : [];
    const resolvedModels = sharedModels.map((m) => {
      const originalId = m.id || m;
      const relayId = relayMap?.[originalId];
      return relayId ? { id: relayId, name: m.name } : m;
    });

    // Merge: keep user-added models from OpenClaw, add ours if missing
    const existingModels = Array.isArray(existing.models) ? existing.models : [];
    const mergedModelIds = new Set(existingModels.map((m) => m.id || m));
    const mergedModels = [...existingModels];
    for (const m of resolvedModels) {
      if (!mergedModelIds.has(m.id || m)) {
        mergedModels.push(m);
      }
    }

    // Use custom baseUrl from user config (relay/proxy) if set, otherwise default.
    const customBaseUrl = config[configKey]?.baseUrl || config[providerKey]?.baseUrl;
    // When using a relay, force openai-completions API since relays (NewAPI/OneAPI)
    // expose OpenAI-compatible endpoints, not native Anthropic/Google formats.
    const effectiveApi = customBaseUrl ? "openai-completions" : providerCfg.api;
    internal.models.providers[providerKey] = {
      ...existing,
      baseUrl: customBaseUrl || providerCfg.baseUrl,
      apiKey: apiKey ?? existing.apiKey,
      api: effectiveApi,
      models: mergedModels,
    };
  }

  // Register community plugins ONLY if user has configured the corresponding channel.
  // Unconditionally loading plugins (especially openclaw-weixin) can crash/hang the
  // gateway at startup even when unconfigured — unlike bundled plugins which skip gracefully.
  const corePlugins = path.join(BASE_DIR, "app", "core", "node_modules");
  const pluginPaths = [];
  const userChannels = (config.channels && typeof config.channels === "object") ? config.channels : {};
  // Map: channel config key → plugin npm path
  const pluginMap = {
    qqbot: path.join(corePlugins, "@tencent-connect", "openclaw-qqbot"),
    "openclaw-weixin": path.join(corePlugins, "@tencent-weixin", "openclaw-weixin"),
    // Feishu is BUNDLED in OpenClaw 3.22+ — never register here
  };
  for (const [channelId, pluginPath] of Object.entries(pluginMap)) {
    if (userChannels[channelId] && fs.existsSync(pluginPath)) {
      pluginPaths.push(pluginPath);
    }
  }

  // Clean up stale plugins from $OPENCLAW_HOME/node_modules/ left by previous versions.
  // These have broken openclaw/plugin-sdk resolution and cause gateway load failures.
  const stalePluginDir = path.join(DATA_DIR, ".openclaw", "node_modules");
  if (fs.existsSync(stalePluginDir)) {
    try { fs.rmSync(stalePluginDir, { recursive: true, force: true }); } catch { /* ok */ }
  }
  if (pluginPaths.length > 0) {
    if (!internal.plugins) internal.plugins = {};
    if (!internal.plugins.load) internal.plugins.load = {};
    internal.plugins.load.paths = pluginPaths;
  }

  // Pass channels config if any channel plugins are found.
  const hasPlugins = pluginPaths.length > 0;
  if (hasPlugins && config.channels && typeof config.channels === "object") {
    const channels = { ...config.channels };
    // Auto-enable WeChat if the plugin is installed but user hasn't configured it
    const hasWeixinPlugin = pluginPaths.some((p) => String(p).includes("openclaw-weixin"));
    if (hasWeixinPlugin && !channels["openclaw-weixin"]) {
      channels["openclaw-weixin"] = { enabled: true };
    }
    internal.channels = channels;
  } else if (!hasPlugins) {
    delete internal.channels;
  }
  // If hasPlugins but no config.channels: leave internal.channels as-is (don't write empty {})

  fs.mkdirSync(internalDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    internalPath,
    JSON.stringify(internal, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );
}

/** Module-level reference to the gateway child process (set in supervisor mode). */
let gatewayChildProcess = null;

/**
 * Notify the OpenClaw gateway to do a graceful restart.
 * On Unix: SIGUSR1. On Windows: write a .restart sentinel file that
 * OpenClaw's health-monitor detects.
 *
 * This is the ONLY mechanism that causes the 18789 Control UI to refresh
 * config. File-based chokidar hot-reload updates runtime but does NOT
 * push changes to connected WebSocket clients.
 */
function notifyGatewayRestart() {
  if (!gatewayChildProcess || gatewayChildProcess.killed) return;

  if (process.platform !== "win32") {
    // Unix: SIGUSR1 triggers graceful restart
    try { gatewayChildProcess.kill("SIGUSR1"); } catch { /* ok */ }
    return;
  }

  // Windows: no SIGUSR1. Kill and re-spawn the gateway process.
  // The supervisor will detect the exit and the health check loop will
  // wait for the new process to start. This is heavy but reliable.
  // Note: we set a flag so the exit handler doesn't terminate the whole process.
  gatewayRestarting = true;
  try { gatewayChildProcess.kill(); } catch { /* ok */ }
}

let gatewayRestarting = false;

/** Mask all apiKey fields in a config object — returns last 4 chars only. */
function maskApiKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    if (key === "apiKey" && typeof obj[key] === "string") {
      const k = obj[key];
      result[key] = k.length > 4 ? "****" + k.slice(-4) : "****";
    } else {
      result[key] = maskApiKeys(obj[key]);
    }
  }
  return result;
}

// ── WeChat QR Login Handlers ──────────────────────────────────────────

/** Fetch a QR code from iLink for WeChat ClawBot login. */
function handleApiWeixinQrStart(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  // Purge expired sessions
  const now = Date.now();
  for (const [key, s] of activeQrSessions) {
    if (now - s.startedAt > QR_SESSION_TTL_MS) activeQrSessions.delete(key);
  }

  const https = require("https");
  const crypto = require("crypto");
  const options = {
    hostname: ILINK_BASE,
    path: "/ilink/bot/get_bot_qrcode?bot_type=3",
    method: "GET",
    headers: { "iLink-App-ClientVersion": "1" },
    timeout: 15000,
  };

  const iReq = https.request(options, (iRes) => {
    let body = "";
    iRes.on("data", (chunk) => { body += chunk; });
    iRes.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.ret !== 0 || !data.qrcode) {
          jsonResponse(res, 502, { error: "iLink 返回异常", detail: body });
          return;
        }
        const sessionKey = crypto.randomUUID();
        activeQrSessions.set(sessionKey, {
          qrcode: data.qrcode,
          qrcodeContent: data.qrcode_img_content,
          startedAt: Date.now(),
          currentApiHost: ILINK_BASE,
        });
        jsonResponse(res, 200, {
          sessionKey,
          qrcodeContent: data.qrcode_img_content,
        });
      } catch {
        jsonResponse(res, 502, { error: "iLink 响应解析失败" });
      }
    });
  });
  iReq.on("error", (err) => {
    jsonResponse(res, 502, { error: "无法连接微信服务: " + err.message });
  });
  iReq.on("timeout", () => {
    iReq.destroy();
    jsonResponse(res, 504, { error: "微信服务连接超时" });
  });
  iReq.end();
}

/**
 * Normalize a WeChat account ID for filesystem storage.
 * Matches the plugin's account ID normalization: @ and . become -
 * e.g. "b0f5860fdecb@im.bot" → "b0f5860fdecb-im-bot"
 */
function normalizeWeixinAccountId(raw) {
  return String(raw).replace(/@/g, "-").replace(/\./g, "-");
}

/**
 * Save WeChat account files after successful QR login.
 * Writes accounts.json, accounts/{id}.json, and credentials/allowFrom.json,
 * then updates user config and triggers gateway restart.
 */
function saveWeixinAccount(data) {
  // Plugin resolves state dir via OPENCLAW_STATE_DIR → $OPENCLAW_HOME/.openclaw
  const stateDir = path.join(DATA_DIR, ".openclaw", ".openclaw");
  const normalizedId = normalizeWeixinAccountId(data.ilink_bot_id);

  // 1. Save account data
  const accountsDir = path.join(stateDir, "openclaw-weixin", "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  const accountData = {
    token: data.bot_token,
    baseUrl: data.baseurl || "https://ilinkai.weixin.qq.com",
    userId: data.ilink_user_id,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(accountsDir, `${normalizedId}.json`),
    JSON.stringify(accountData, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );

  // 2. Register account ID in index
  const indexPath = path.join(stateDir, "openclaw-weixin", "accounts.json");
  let accountIds = [];
  try { accountIds = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch { /* ok */ }
  if (!accountIds.includes(normalizedId)) {
    accountIds.push(normalizedId);
  }
  fs.writeFileSync(indexPath, JSON.stringify(accountIds, null, 2), { encoding: "utf-8", mode: 0o600 });

  // 3. Write allowFrom credentials
  if (data.ilink_user_id) {
    const credDir = path.join(stateDir, "credentials");
    fs.mkdirSync(credDir, { recursive: true });
    const allowFromPath = path.join(credDir, `openclaw-weixin-${normalizedId}-allowFrom.json`);
    fs.writeFileSync(
      allowFromPath,
      JSON.stringify({ version: 1, allowFrom: [data.ilink_user_id] }, null, 2),
      { encoding: "utf-8", mode: 0o600 },
    );
  }

  // 4. Enable channel in user config + trigger channel reload.
  // Always bump channelConfigUpdatedAt — the plugin's own triggerWeixinChannelReload
  // does this to force chokidar to detect a config change and restart the channel.
  // Without this, a repeat QR login (when config already has { enabled: true })
  // produces no config change → no restart → plugin doesn't pick up the new account.
  const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");
  let userConfig = {};
  try { userConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch { /* ok */ }
  if (!userConfig.channels) userConfig.channels = {};
  userConfig.channels["openclaw-weixin"] = {
    ...userConfig.channels["openclaw-weixin"],
    enabled: true,
    channelConfigUpdatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2), { encoding: "utf-8", mode: 0o600 });
  syncInternalConfig(userConfig);
  setTimeout(() => notifyGatewayRestart(), 500);

  return normalizedId;
}

/** Poll iLink for QR scan status (long-poll, up to 35s). */
function handleApiWeixinQrPoll(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  readBody(req, res, (body) => {
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      jsonResponse(res, 400, { error: "Invalid JSON" });
      return;
    }

    const session = activeQrSessions.get(parsed.sessionKey);
    if (!session) {
      jsonResponse(res, 404, { error: "会话不存在或已过期" });
      return;
    }
    // Check TTL
    if (Date.now() - session.startedAt > QR_SESSION_TTL_MS) {
      activeQrSessions.delete(parsed.sessionKey);
      jsonResponse(res, 200, { status: "expired" });
      return;
    }

    const https = require("https");
    const options = {
      hostname: session.currentApiHost,
      path: `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcode)}`,
      method: "GET",
      headers: { "iLink-App-ClientVersion": "1" },
      timeout: 40000, // 35s iLink long-poll + 5s buffer
    };

    const iReq = https.request(options, (iRes) => {
      let respBody = "";
      iRes.on("data", (chunk) => { respBody += chunk; });
      iRes.on("end", () => {
        try {
          const data = JSON.parse(respBody);
          const status = data.status || "wait";

          if (status === "confirmed") {
            // Login successful — save account files and restart gateway
            activeQrSessions.delete(parsed.sessionKey);
            try {
              const accountId = saveWeixinAccount(data);
              console.log(`[口袋龙虾 UI] [微信] 扫码登录成功: ${accountId}`);
              jsonResponse(res, 200, { status: "confirmed", accountId });
            } catch (err) {
              console.error(`[口袋龙虾 UI] [微信] 账号保存失败: ${err.message}`);
              console.error(err.stack);
              jsonResponse(res, 500, { status: "error", error: "账号保存失败: " + err.message });
            }
            return;
          }

          if (status === "expired") {
            activeQrSessions.delete(parsed.sessionKey);
            jsonResponse(res, 200, { status: "expired" });
            return;
          }

          if (status === "scaned_but_redirect") {
            // iLink IDC redirect: switch polling to new host
            if (data.redirect_host) {
              session.currentApiHost = data.redirect_host;
            }
            jsonResponse(res, 200, { status: "wait" });
            return;
          }

          // "wait" or "scaned" — return as-is
          jsonResponse(res, 200, { status });
        } catch {
          // Parse error — treat as still waiting
          jsonResponse(res, 200, { status: "wait" });
        }
      });
    });
    iReq.on("error", () => {
      // Network error — client will retry
      jsonResponse(res, 200, { status: "wait" });
    });
    iReq.on("timeout", () => {
      iReq.destroy();
      // Long-poll timeout — no one scanned yet, return wait
      jsonResponse(res, 200, { status: "wait" });
    });
    iReq.end();
  });
}

// ── End WeChat QR Login ─────────────────────────────────────────────────

function handleApiConfig(req, res) {
  const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");

  if (req.method === "GET") {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      jsonResponse(res, 200, maskApiKeys(raw));
    } catch {
      jsonResponse(res, 404, { error: "Config not found" });
    }
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    readBody(req, res, (body) => {
      try {
        const parsed = JSON.parse(body);

        // Restore real API keys when frontend sends masked values (****xxxx)
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch { /* first run */ }
        for (const key of Object.keys(parsed)) {
          if (
            parsed[key] &&
            typeof parsed[key] === "object" &&
            typeof parsed[key].apiKey === "string" &&
            parsed[key].apiKey.startsWith("****")
          ) {
            if (existing[key]?.apiKey) {
              parsed[key].apiKey = existing[key].apiKey;
            }
          }
        }

        const finalBody = JSON.stringify(parsed, null, 2);
        fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(configPath, finalBody, { encoding: "utf-8", mode: 0o600 });

        // Sync to OpenClaw auth store and internal config
        syncAuthProfiles(parsed);
        // Only update the model in internal config if the user explicitly changed it.
        // Without this check, saving an API key overwrites whatever model the user
        // selected in the 18789 Control UI.
        const modelChanged = parsed.agent?.model && parsed.agent.model !== existing.agent?.model;
        const channelsChanged = JSON.stringify(parsed.channels || null) !== JSON.stringify(existing.channels || null);
        // Detect baseUrl changes (relay/proxy) that require gateway restart
        const baseUrlChanged = KNOWN_PROVIDERS.some((pid) => {
          const newUrl = parsed[pid]?.baseUrl;
          const oldUrl = existing[pid]?.baseUrl;
          return newUrl !== undefined && newUrl !== oldUrl;
        });
        syncInternalConfig(parsed, { updateModel: modelChanged });

        // Delay restart 500ms to let chokidar complete its hot-reload cycle (300ms debounce).
        // Without this delay, the gateway restart races with hot-reload and may cache stale model.
        const needsRestart = modelChanged || channelsChanged || baseUrlChanged;
        if (needsRestart) {
          setTimeout(() => notifyGatewayRestart(), 500);
        }

        jsonResponse(res, 200, { success: true });
      } catch {
        jsonResponse(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  res.writeHead(405, SECURITY_HEADERS);
  res.end();
}

function handleApiVersion(res) {
  const versionPath = path.join(BASE_DIR, "version.txt");
  try {
    const version = fs.readFileSync(versionPath, "utf-8").trim();
    jsonResponse(res, 200, { version });
  } catch {
    jsonResponse(res, 500, { error: "Version file not found" });
  }
}

function handleApiOpenclawVersion(res) {
  const pkgPath = path.join(BASE_DIR, "app", "core", "node_modules", "openclaw", "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    jsonResponse(res, 200, { version: pkg.version });
  } catch {
    jsonResponse(res, 500, { error: "OpenClaw version not found" });
  }
}

// ---------------------------------------------------------------------------
// One-click update: /api/update (POST) + /api/update/status (GET)
// ---------------------------------------------------------------------------

let updateState = { status: "idle", progress: 0, error: null, version: null };

/** Check latest version from GitHub API, download from Aliyun OSS (China CDN). */
function fetchLatestRelease() {
  const https = require("https");

  const OSS_BASE = "https://pocketclawaus.oss-cn-shanghai.aliyuncs.com";

  const sources = [
    {
      name: "GitHub",
      url: "https://api.github.com/repos/Austin5925/PocketClaw/releases/latest",
      headers: { "User-Agent": "PocketClaw", Accept: "application/vnd.github.v3+json" },
      parseVersion: (data) => data.tag_name?.replace(/^v/, ""),
      buildDownloadUrl: (ver) => `${OSS_BASE}/v${ver}/PocketClaw-v${ver}-update.zip`,
    },
  ];

  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= sources.length) {
        reject(new Error("无法获取最新版本，请检查网络"));
        return;
      }
      const src = sources[idx++];
      https.get(src.url, { headers: src.headers, timeout: 8000 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const ver = src.parseVersion(data);
            if (ver) {
              resolve({ version: ver, downloadUrl: src.buildDownloadUrl(ver), source: src.name });
            } else {
              tryNext();
            }
          } catch { tryNext(); }
        });
      }).on("error", () => tryNext())
        .on("timeout", function() { this.destroy(); tryNext(); });
    };
    tryNext();
  });
}

async function startUpdate() {
  const https = require("https");
  const { execSync } = require("child_process");

  try {
    updateState = { status: "checking", progress: 5, error: null, version: null };

    // 1. Get latest version from GitHub API, download from Aliyun OSS
    const release = await fetchLatestRelease();
    const latestVersion = release.version;
    if (!latestVersion) throw new Error("无法获取最新版本信息");

    // Check current version
    const currentVersion = fs
      .readFileSync(path.join(BASE_DIR, "version.txt"), "utf-8")
      .trim();
    if (currentVersion === latestVersion) {
      updateState = { status: "idle", progress: 0, error: null, version: null };
      return { alreadyUpToDate: true };
    }

    updateState = {
      status: "downloading",
      progress: 20,
      error: null,
      version: latestVersion,
    };

    // 2. Download update zip (using the URL from whichever source responded)
    const updateUrl = release.downloadUrl;
    const tmpFile = path.join(
      require("os").tmpdir(),
      `pocketclaw-update-${latestVersion}.zip`,
    );

    // Download with redirect following, retry, and overall timeout
    const downloadWithRetry = (url, dest, retries = 3) => {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const overallTimeout = setTimeout(() => {
          reject(new Error("下载超时（5 分钟），请检查网络后重试"));
        }, 5 * 60000);

        const attempt = (currentUrl) => {
          attempts++;
          const proto = currentUrl.startsWith("http://") ? require("http") : https;
          const req = proto.get(
            currentUrl,
            { headers: { "User-Agent": "PocketClaw" }, timeout: 30000 },
            (res) => {
              // Follow redirects (GitHub → CDN)
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); // MUST drain redirect response to free the connection
                attempt(res.headers.location);
                return;
              }
              if (res.statusCode !== 200) {
                res.resume();
                const err = new Error(`下载失败: HTTP ${res.statusCode}`);
                if (attempts < retries) {
                  updateState.progress = 20;
                  setTimeout(() => attempt(url), 3000);
                } else {
                  clearTimeout(overallTimeout);
                  reject(err);
                }
                return;
              }
              const file = fs.createWriteStream(dest);
              res.pipe(file);
              file.on("finish", () => { file.close(); clearTimeout(overallTimeout); resolve(); });
              file.on("error", (e) => { clearTimeout(overallTimeout); reject(e); });
            },
          );
          req.on("error", (e) => {
            if (attempts < retries) {
              updateState.progress = 20;
              setTimeout(() => attempt(url), 3000);
            } else {
              clearTimeout(overallTimeout);
              reject(new Error(`下载失败（${attempts} 次尝试）: ${e.message}`));
            }
          });
          req.on("timeout", () => {
            req.destroy();
            if (attempts < retries) {
              setTimeout(() => attempt(url), 2000);
            } else {
              clearTimeout(overallTimeout);
              reject(new Error("下载连接超时，请检查网络"));
            }
          });
        };
        attempt(url);
      });
    };

    await downloadWithRetry(updateUrl, tmpFile);

    updateState.status = "backing_up";
    updateState.progress = 50;

    // 3. Backup
    const backupDir = path.join(DATA_DIR, "backups");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const backupPath = path.join(
      backupDir,
      `app-${currentVersion}-${timestamp}`,
    );
    fs.mkdirSync(backupPath, { recursive: true });
    // Simple backup: copy version.txt
    fs.copyFileSync(
      path.join(BASE_DIR, "version.txt"),
      path.join(backupPath, "version.txt"),
    );

    updateState.status = "extracting";
    updateState.progress = 70;

    // On Windows, kill the gateway BEFORE extraction. Windows locks files held by
    // running processes — extracting over a live OpenClaw overwrites partial files,
    // causing OpenClaw to detect changes and self-restart as a rogue process WITHOUT
    // our env vars (no disable flags). Unix doesn't have this issue because overwriting
    // a running file just unlinks the old inode; the process keeps using it until exit.
    if (process.platform === "win32" && gatewayChildProcess && !gatewayChildProcess.killed) {
      try { gatewayChildProcess.kill(); } catch { /* ok */ }
      // Give it a moment to release file locks
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 4. Extract — use tar (built-in since Windows 10 1803, 5-10x faster than PowerShell Expand-Archive)
    if (process.platform === "win32") {
      try {
        // tar.exe (bsdtar) is built into Windows 10 1803+ and MUCH faster
        execSync(`tar -xf "${tmpFile}" -C "${BASE_DIR}"`, { timeout: 120000 });
      } catch {
        // Fallback to PowerShell for older Windows
        execSync(
          `powershell -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${BASE_DIR}' -Force"`,
          { timeout: 300000 },
        );
      }
    } else {
      execSync(`unzip -qo "${tmpFile}" -d "${BASE_DIR}"`, { timeout: 120000 });
    }

    // 5. Update version.txt
    fs.writeFileSync(path.join(BASE_DIR, "version.txt"), latestVersion);

    // 6. Run migrate.js if exists
    updateState.status = "migrating";
    updateState.progress = 90;
    const migrateScript = path.join(SCRIPT_DIR, "migrate.js");
    if (fs.existsSync(migrateScript)) {
      try {
        execSync(`"${process.execPath}" "${migrateScript}" "${BASE_DIR}"`, {
          timeout: 30000,
        });
      } catch {
        /* migration warnings ok */
      }
    }

    // Cleanup
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ok */
    }

    updateState = {
      status: "complete",
      progress: 100,
      error: null,
      version: latestVersion,
    };
    return { success: true, version: latestVersion };
  } catch (err) {
    updateState = {
      status: "error",
      progress: 0,
      error: err.message || "更新失败",
      version: null,
    };
    throw err;
  }
}

function handleApiUpdate(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  if (updateState.status !== "idle" && updateState.status !== "error" && updateState.status !== "complete") {
    jsonResponse(res, 409, { error: "更新正在进行中" });
    return;
  }

  startUpdate()
    .then((result) => {
      jsonResponse(res, 200, result);
    })
    .catch((err) => {
      jsonResponse(res, 500, { error: err.message || "更新失败" });
    });
}

function handleApiUpdateStatus(res) {
  jsonResponse(res, 200, updateState);
}

// ---------------------------------------------------------------------------
// OpenClaw kernel version check: /api/openclaw-check (GET)
// Portable runtime has no npm — OpenClaw updates are delivered via PocketClaw
// release packages. This endpoint only CHECKS for updates (no install).
// ---------------------------------------------------------------------------

function handleApiOpenclawCheck(res) {
  const pkgPath = path.join(BASE_DIR, "app", "core", "node_modules", "openclaw", "package.json");
  let current = "unknown";
  try {
    current = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
  } catch { /* ok */ }

  // Check npm registry for latest version
  const https = require("https");
  const req = https.get("https://registry.npmjs.org/openclaw/latest", { timeout: 10000 }, (apiRes) => {
    let body = "";
    apiRes.on("data", (chunk) => { body += chunk; });
    apiRes.on("end", () => {
      try {
        const data = JSON.parse(body);
        const latest = data.version || "unknown";
        jsonResponse(res, 200, { current, latest, updateAvailable: current !== latest && latest !== "unknown" });
      } catch {
        jsonResponse(res, 200, { current, latest: null, updateAvailable: false });
      }
    });
  });
  req.on("error", () => {
    jsonResponse(res, 200, { current, latest: null, updateAvailable: false, error: "无法检查 OpenClaw 更新" });
  });
  req.on("timeout", () => { req.destroy(); });
}

function handleApiHealth(res) {
  const gatewayUrl = `http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`;
  const reqLib = require("http");

  reqLib
    .get(gatewayUrl, { timeout: 3000 }, (gwRes) => {
      let data = "";
      gwRes.on("data", (chunk) => (data += chunk));
      gwRes.on("end", () => {
        jsonResponse(res, 200, {
          ui: "ok",
          gateway: "ok",
          gatewayResponse: data,
        });
      });
    })
    .on("error", () => {
      jsonResponse(res, 200, { ui: "ok", gateway: "unreachable" });
    });
}

// Loaded from shared-config.json (single source of truth for providers).
const PROVIDER_VALIDATORS = Object.fromEntries(
  SHARED_CONFIG.providers.map((p) => [
    p.id,
    { url: p.validateUrl, method: p.validateMethod, auth: p.validateAuth },
  ]),
);

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function readBody(req, res, callback) {
  let body = "";
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      jsonResponse(res, 413, { error: "Payload too large" });
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on("end", () => callback(body));
}

function validateKeyRequest(validator, apiKey, model, res) {
  const https = require("https");
  const urlObj = new URL(validator.url);

  const headers = { "Content-Type": "application/json" };
  if (validator.auth === "bearer") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  let postData = null;
  const options = {
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    method: validator.method,
    headers,
    timeout: 10000,
  };

  if (validator.method === "POST") {
    let modelId = (model || "").split("/")[1] || "";
    if (!modelId) {
      // Fallback model for validation by provider
      if (urlObj.hostname.includes("minimaxi")) modelId = "MiniMax-M2.7";
      else if (urlObj.hostname.includes("anthropic")) modelId = "claude-haiku-4-5";
      else if (urlObj.hostname.includes("volces.com")) modelId = "doubao-seed-2-0-mini-260215";
      else modelId = "test";
    }
    postData = JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    options.headers["Content-Length"] = Buffer.byteLength(postData);
  }

  const apiReq = https.request(options, (apiRes) => {
    let body = "";
    apiRes.on("data", (c) => { body += c; });
    apiRes.on("end", () => {
      if (res.headersSent) return;
      if (apiRes.statusCode === 401 || apiRes.statusCode === 403) {
        // Try to extract error message from response body
        let detail = "";
        try {
          const parsed = JSON.parse(body);
          detail = parsed.error?.message || parsed.message || "";
        } catch { /* not JSON */ }
        const errorMsg = detail
          ? `验证失败 (HTTP ${apiRes.statusCode}): ${detail}`
          : `API Key 无效 (HTTP ${apiRes.statusCode})`;
        jsonResponse(res, 200, { valid: false, error: errorMsg });
      } else {
        jsonResponse(res, 200, { valid: true });
      }
    });
  });

  apiReq.on("error", () => {
    if (!res.headersSent) jsonResponse(res, 200, { valid: true });
  });

  apiReq.on("timeout", () => {
    apiReq.destroy();
    if (!res.headersSent) jsonResponse(res, 200, { valid: true });
  });

  if (postData) apiReq.write(postData);
  apiReq.end();
}

function handleApiValidateKey(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  readBody(req, res, (body) => {
    try {
      const { provider, apiKey, model } = JSON.parse(body);
      const validator = PROVIDER_VALIDATORS[provider];
      if (!validator || !apiKey) {
        jsonResponse(res, 200, { valid: true });
        return;
      }
      validateKeyRequest(validator, apiKey, model, res);
    } catch {
      jsonResponse(res, 400, { error: "Invalid request" });
    }
  });
}

// ---------------------------------------------------------------------------
// Relay model auto-detection: POST /api/detect-relay-models
// ---------------------------------------------------------------------------

/**
 * Normalize a model name for fuzzy matching.
 * e.g. "anthropic/claude-sonnet-4.6@20260315" → "claude-sonnet-4-6"
 */
function normalizeModelName(name) {
  let n = name.toLowerCase().trim();
  // Strip provider prefix (everything before first /)
  const slashIdx = n.indexOf("/");
  if (slashIdx > 0) n = n.slice(slashIdx + 1);
  // Strip @date suffix
  n = n.replace(/@\d+$/, "");
  // Dots to dashes for version comparison
  n = n.replace(/\./g, "-");
  return n;
}

/**
 * Match relay model IDs against known model IDs using fuzzy normalization.
 * Returns { matched: { knownId: relayId }, unmatched: [relayIds] }
 */
function matchRelayModels(relayModelIds, knownModels) {
  // Build lookup: normalized → knownModel.id
  const knownLookup = new Map();
  for (const m of knownModels) {
    const id = m.id || m;
    knownLookup.set(normalizeModelName(id), id);
  }

  const matched = {};
  const matchedRelay = new Set();

  for (const relayId of relayModelIds) {
    const normalized = normalizeModelName(relayId);
    if (knownLookup.has(normalized)) {
      const knownId = knownLookup.get(normalized);
      if (!matched[knownId]) {
        matched[knownId] = relayId;
        matchedRelay.add(relayId);
      }
    }
  }

  const unmatched = relayModelIds.filter((id) => !matchedRelay.has(id));
  return { matched, unmatched };
}

/**
 * POST /api/detect-relay-models
 * Fetches model list from a relay's /models endpoint and matches against known models.
 * Body: { providerId: string, baseUrl: string, apiKey: string }
 */
function handleApiDetectRelayModels(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  readBody(req, res, (body) => {
    try {
      const parsed = JSON.parse(body);
      const providerId = parsed.providerId;
      const baseUrl = parsed.baseUrl;
      // Use provided key, or fall back to saved key from user config
      let apiKey = parsed.apiKey;
      if (!apiKey) {
        const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          apiKey = cfg[providerId]?.apiKey;
        } catch { /* ok */ }
      }
      if (!baseUrl || !apiKey) {
        jsonResponse(res, 200, { success: false, error: "缺少 baseUrl 或 apiKey" });
        return;
      }

      // Resolve the OpenClaw provider key for model lookup
      const openclawKey = OPENCLAW_PROVIDER[providerId] || providerId;
      const providerCfg = SHARED_CONFIG[openclawKey];
      if (!providerCfg?.models) {
        jsonResponse(res, 200, { success: false, error: `未知 provider: ${providerId}` });
        return;
      }

      // Build the /models URL — try baseUrl/models first
      let modelsUrl = baseUrl.replace(/\/+$/, "");
      if (!modelsUrl.endsWith("/models")) {
        modelsUrl += "/models";
      }

      const urlObj = new URL(modelsUrl);
      const httpMod = urlObj.protocol === "https:" ? require("https") : require("http");

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ""),
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      };

      const apiReq = httpMod.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", (chunk) => { data += chunk; });
        apiRes.on("end", () => {
          try {
            const json = JSON.parse(data);
            // OpenAI-compatible format: { data: [{ id: "model-name", ... }] }
            const models = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
            const relayModelIds = models.map((m) => m.id).filter(Boolean);

            if (relayModelIds.length === 0) {
              jsonResponse(res, 200, { success: false, error: "中转站返回空模型列表" });
              return;
            }

            const { matched, unmatched } = matchRelayModels(relayModelIds, providerCfg.models);
            jsonResponse(res, 200, {
              success: true,
              matched,
              matchCount: Object.keys(matched).length,
              totalRelay: relayModelIds.length,
              unmatched: unmatched.slice(0, 20), // Limit for readability
            });
          } catch {
            jsonResponse(res, 200, {
              success: false,
              error: `中转站返回格式异常: ${data.slice(0, 200)}`,
            });
          }
        });
      });

      apiReq.on("error", (e) => {
        jsonResponse(res, 200, { success: false, error: `连接中转站失败: ${e.message}` });
      });
      apiReq.on("timeout", () => {
        apiReq.destroy();
        jsonResponse(res, 200, { success: false, error: "中转站连接超时 (10s)" });
      });
      apiReq.end();
    } catch (e) {
      jsonResponse(res, 400, { error: `Invalid request: ${e.message}` });
    }
  });
}

/**
 * Diagnostic endpoint: GET /api/debug-config
 * Returns the actual internal openclaw.json that the gateway reads,
 * with API keys masked. Shows whether stale keys exist.
 */
function handleApiDebugConfig(_req, res) {
  const internalPath = path.join(DATA_DIR, ".openclaw", ".openclaw", "openclaw.json");
  try {
    const raw = JSON.parse(fs.readFileSync(internalPath, "utf-8"));
    // Mask all API keys for security
    const masked = maskApiKeys(raw);
    // Flag stale keys that shouldn't exist
    const staleKeys = ["browser", "canvasHost", "discovery", "update"]
      .filter((k) => k in raw);
    jsonResponse(res, 200, {
      config: masked,
      staleKeys,
      hasStaleKeys: staleKeys.length > 0,
      moonshotProvider: masked?.models?.providers?.moonshot || null,
      defaultModel: masked?.agents?.defaults?.model || null,
    });
  } catch (e) {
    jsonResponse(res, 200, { error: `无法读取: ${e.message}` });
  }
}

/**
 * Diagnostic endpoint: GET /api/debug-log?lines=100&filter=chat
 * Returns the tail of the OpenClaw detailed log file (/tmp/openclaw/).
 * Optional query params: lines (default 200), filter (grep keyword).
 */
function handleApiDebugLog(req, res) {
  const url = new URL(req.url || "/", `http://localhost:${UI_PORT}`);
  const lines = Math.min(parseInt(url.searchParams.get("lines") || "200", 10), 2000);
  const filter = url.searchParams.get("filter") || "";

  // Find today's OpenClaw log
  const today = new Date().toISOString().slice(0, 10);
  const logPath = `/tmp/openclaw/openclaw-${today}.log`;
  const altLogPath = path.join(DATA_DIR, "pocketclaw.log");

  let targetPath = logPath;
  if (!fs.existsSync(logPath)) targetPath = altLogPath;

  try {
    const content = fs.readFileSync(targetPath, "utf-8");
    let allLines = content.split("\n");
    if (filter) {
      allLines = allLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()));
    }
    const tail = allLines.slice(-lines);
    jsonResponse(res, 200, {
      logFile: targetPath,
      totalLines: allLines.length,
      returnedLines: tail.length,
      filter: filter || null,
      lines: tail,
    });
  } catch (e) {
    jsonResponse(res, 200, { error: `日志文件不可读: ${e.message}`, path: targetPath });
  }
}

/**
 * Diagnostic endpoint: POST /api/test-chat
 * Bypasses OpenClaw and makes a direct chat completions call to the provider API.
 * Used to verify that the Kimi (moonshot) API is reachable and responding correctly.
 * Body: { provider?: string } (defaults to current default model's provider)
 */
function handleApiTestChat(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, SECURITY_HEADERS);
    res.end();
    return;
  }

  readBody(req, res, (body) => {
    try {
      const https = require("https");
      const parsed = body ? JSON.parse(body) : {};

      // Read user config for API keys and model
      const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");
      let config = {};
      try { config = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch { /* ok */ }

      // Determine target provider
      const currentModel = config.agent?.model || "minimax/MiniMax-M2.7";
      const providerPrefix = parsed.provider || currentModel.split("/")[0];
      const modelId = currentModel.split("/")[1] || currentModel;

      // Look up provider config from shared-config
      const providerCfg = SHARED_CONFIG[providerPrefix];
      if (!providerCfg) {
        jsonResponse(res, 200, { ok: false, error: `未知 provider: ${providerPrefix}` });
        return;
      }

      // Find API key
      const configKey = CONFIG_KEY_FOR_PROVIDER[providerPrefix] || providerPrefix;
      const apiKey = config[configKey]?.apiKey || config[providerPrefix]?.apiKey;
      if (!apiKey) {
        jsonResponse(res, 200, { ok: false, error: `未找到 ${providerPrefix} 的 API Key` });
        return;
      }

      // Determine base URL (custom relay or default)
      const customBaseUrl = config[configKey]?.baseUrl || config[providerPrefix]?.baseUrl;
      const baseUrl = customBaseUrl || providerCfg.baseUrl;

      const urlObj = new URL(baseUrl + "/chat/completions");
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };

      // Non-OpenAI formats: skip direct test (validate-key already covers them)
      if (providerCfg.api !== "openai-completions") {
        jsonResponse(res, 200, { ok: true, skipped: true, reason: `${providerCfg.api} 格式暂不支持直接测试，请用"验证"按钮` });
        return;
      }

      const postData = JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 10,
        stream: false,
      });

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(postData) },
        timeout: 30000,
      };

      const startTime = Date.now();
      const apiReq = https.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", (chunk) => { data += chunk; });
        apiRes.on("end", () => {
          const elapsed = Date.now() - startTime;
          try {
            const json = JSON.parse(data);
            if (apiRes.statusCode === 200 && json.choices) {
              const reply = json.choices[0]?.message?.content || "(empty)";
              jsonResponse(res, 200, {
                ok: true,
                provider: providerPrefix,
                model: modelId,
                baseUrl,
                statusCode: apiRes.statusCode,
                reply: reply.slice(0, 200),
                elapsed: `${elapsed}ms`,
              });
            } else {
              jsonResponse(res, 200, {
                ok: false,
                provider: providerPrefix,
                model: modelId,
                baseUrl,
                statusCode: apiRes.statusCode,
                error: json.error?.message || JSON.stringify(json).slice(0, 500),
                elapsed: `${elapsed}ms`,
              });
            }
          } catch {
            jsonResponse(res, 200, {
              ok: false,
              provider: providerPrefix,
              model: modelId,
              baseUrl,
              statusCode: apiRes.statusCode,
              error: `Non-JSON response: ${data.slice(0, 200)}`,
              elapsed: `${elapsed}ms`,
            });
          }
        });
      });

      apiReq.on("error", (e) => {
        jsonResponse(res, 200, {
          ok: false,
          provider: providerPrefix,
          model: modelId,
          baseUrl,
          error: `连接失败: ${e.message}`,
        });
      });

      apiReq.on("timeout", () => {
        apiReq.destroy();
        jsonResponse(res, 200, {
          ok: false,
          provider: providerPrefix,
          model: modelId,
          baseUrl,
          error: "请求超时 (30s)",
        });
      });

      apiReq.write(postData);
      apiReq.end();
    } catch (e) {
      jsonResponse(res, 400, { error: `Invalid request: ${e.message}` });
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${UI_PORT}`);
  const pathname = url.pathname;

  if (pathname === "/api/config") return handleApiConfig(req, res);
  if (pathname === "/api/validate-key") return handleApiValidateKey(req, res);
  if (pathname === "/api/test-chat") return handleApiTestChat(req, res);
  if (pathname === "/api/detect-relay-models") return handleApiDetectRelayModels(req, res);
  if (pathname === "/api/debug-config") return handleApiDebugConfig(req, res);
  if (pathname === "/api/debug-log") return handleApiDebugLog(req, res);
  if (pathname === "/api/version") return handleApiVersion(res);
  if (pathname === "/api/openclaw-version") return handleApiOpenclawVersion(res);
  if (pathname === "/api/health") return handleApiHealth(res);
  if (pathname === "/api/update" && req.method === "POST")
    return handleApiUpdate(req, res);
  if (pathname === "/api/update/status") return handleApiUpdateStatus(res);
  if (pathname === "/api/openclaw-check") return handleApiOpenclawCheck(res);
  if (pathname === "/api/weixin/qr-start") return handleApiWeixinQrStart(req, res);
  if (pathname === "/api/weixin/qr-poll") return handleApiWeixinQrPoll(req, res);

  const filePath = path.join(UI_DIR, pathname === "/" ? "index.html" : pathname);
  if (serveStatic(res, filePath)) return;

  const indexPath = path.join(UI_DIR, "index.html");
  if (serveStatic(res, indexPath)) return;

  res.writeHead(404, SECURITY_HEADERS);
  res.end("Not Found");
});

server.on("upgrade", (req, socket, head) => {
  createProxyServer(req, socket, head, GATEWAY_HOST, GATEWAY_PORT);
});

// ---------------------------------------------------------------------------
// --supervisor mode: manage gateway lifecycle (used by .bat / .command launcher)
// ---------------------------------------------------------------------------

function findOpenClawEntry() {
  const coreDir = path.join(BASE_DIR, "app", "core", "node_modules", "openclaw");
  const pkgPath = path.join(coreDir, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    // Try bin field first
    if (typeof pkg.bin === "string") {
      const entry = path.join(coreDir, pkg.bin);
      if (fs.existsSync(entry)) return entry;
    } else if (typeof pkg.bin === "object" && pkg.bin !== null) {
      for (const v of Object.values(pkg.bin)) {
        const entry = path.join(coreDir, v);
        if (fs.existsSync(entry)) return entry;
      }
    }
    // Fallback to main
    if (pkg.main) {
      const entry = path.join(coreDir, pkg.main);
      if (fs.existsSync(entry)) return entry;
    }
  } catch { /* fall through */ }
  // Last resort: common patterns
  for (const candidate of ["bin/cli.js", "dist/cli.js", "dist/index.js"]) {
    const entry = path.join(coreDir, candidate);
    if (fs.existsSync(entry)) return entry;
  }
  return null;
}

function openBrowser(url) {
  const { exec } = require("child_process");
  if (process.platform === "win32") exec(`start ${url}`);
  else if (process.platform === "darwin") exec(`open ${url}`);
}

if (process.argv.includes("--supervisor")) {
  const { spawn } = require("child_process");
  const log = (msg) => console.log(`  ${msg}`);

  // 1. Config sync
  const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch { /* first run, no config yet */ }

  process.env.OPENCLAW_HOME = path.join(DATA_DIR, ".openclaw");
  process.env.OPENCLAW_STATE_DIR = path.join(DATA_DIR, ".openclaw", ".openclaw");
  process.env.PATH = path.join(BASE_DIR, "app", "runtime", "node-win-x64") +
    path.delimiter + process.env.PATH;

  // Always sync internal config (gateway auth settings) even on first run with empty config.
  // Without this, gateway.auth.mode="none" and dangerouslyDisableDeviceAuth=true are never
  // written, causing the gateway to reject UI WebSocket connections on fresh installs.
  // On startup, set model from user config (first-time setup or config migration).
  // After startup, model changes come from 18789 Control UI and should NOT be overwritten.
  syncInternalConfig(config, { updateModel: true });
  if (Object.keys(config).length > 0) {
    syncAuthProfiles(config);
  }

  // Clear old sessions on every startup. PocketClaw is a consumer product where
  // session persistence across restarts is not expected. Stale sessions cause:
  // - Cached thinkingLevel overrides thinkingDefault → Kimi K2.5 silent failure
  // - Orphaned messages from failed runs → session tree corruption → all models hang
  const sessionsDir = path.join(DATA_DIR, ".openclaw", ".openclaw", "agents", "main", "sessions");
  try {
    if (fs.existsSync(sessionsDir)) {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
      log("已清理旧会话缓存");
    }
  } catch { /* ok */ }

  log("配置同步完成");

  // 2. Find OpenClaw
  const openclawEntry = findOpenClawEntry();
  if (!openclawEntry) {
    log("[错误] AI 引擎未找到，请确认文件完整。");
    process.exit(1);
  }

  // Apply proxy from user config (Settings -> 关于与更新 Tab)
  if (config.proxy?.httpsProxy) {
    process.env.HTTPS_PROXY = config.proxy.httpsProxy;
    process.env.HTTP_PROXY = config.proxy.httpsProxy;
  }

  // Set gateway env vars on process.env so ALL child processes inherit them —
  // including Windows model-switch restarts which use { ...process.env }.
  // Previously these were only in the initial spawn's env option, causing any
  // gateway restart on Windows to lose the disable flags → canvas/browser enabled → slow.
  process.env.OPENCLAW_HOME = path.join(DATA_DIR, ".openclaw");
  process.env.OPENCLAW_STATE_DIR = path.join(DATA_DIR, ".openclaw", ".openclaw");
  process.env.OPENCLAW_SKIP_BROWSER_CONTROL_SERVER = "1";
  process.env.OPENCLAW_DISABLE_BONJOUR = "1";
  process.env.OPENCLAW_SKIP_CANVAS_HOST = "1";
  process.env.OPENCLAW_LOG_LEVEL = "debug";

  // 3. Start gateway
  log("正在启动 AI 引擎...");
  let gatewayProcess = spawn(
    process.execPath,
    [openclawEntry, "gateway", "--port", String(GATEWAY_PORT), "--allow-unconfigured", "--verbose"],
    {
      cwd: BASE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );
  // Write gateway output to log file for diagnostics
  const logPath = path.join(DATA_DIR, "pocketclaw.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a", mode: 0o600 });
  gatewayChildProcess = gatewayProcess;
  gatewayProcess.stdout.on("data", (chunk) => logStream.write(chunk));
  gatewayProcess.stderr.on("data", (chunk) => logStream.write(chunk));

  // Cleanup on exit
  const cleanup = () => {
    if (gatewayProcess && !gatewayProcess.killed) gatewayProcess.kill();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  gatewayProcess.on("exit", (code) => {
    // During update extraction, we intentionally kill the gateway to release
    // Windows file locks. Don't crash or restart — update will prompt user to restart.
    if (updateState.status === "extracting" || updateState.status === "migrating" || updateState.status === "complete") {
      return;
    }
    if (gatewayRestarting) {
      // Windows model-switch restart: re-spawn the gateway
      gatewayRestarting = false;
      log("[gateway] 模型已切换，正在重启 AI 引擎...");
      const newGw = spawn(
        process.execPath,
        [openclawEntry, "gateway", "--port", String(GATEWAY_PORT), "--allow-unconfigured", "--verbose"],
        { cwd: BASE_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
      );
      newGw.stdout.on("data", (chunk) => logStream.write(chunk));
      newGw.stderr.on("data", (chunk) => logStream.write(chunk));
      newGw.on("exit", gatewayProcess.listeners("exit")[0]); // re-attach this handler
      gatewayProcess = newGw;
      gatewayChildProcess = newGw;
      return;
    }
    if (code !== null && code !== 0) {
      log(`[错误] AI 引擎异常退出 (code ${code})`);
      process.exit(1);
    }
  });

  // 4. Wait for gateway health
  const waitForGateway = () => {
    let elapsed = 0;
    const check = () => {
      const req = http.get(
        `http://127.0.0.1:${GATEWAY_PORT}/health`,
        { timeout: 2000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            log("AI 引擎已启动");
            startUI();
          } else {
            retry();
          }
        },
      );
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      elapsed++;
      if (elapsed > 60) {
        log("[错误] AI 引擎启动超时");
        cleanup();
        process.exit(1);
      }
      if (elapsed % 5 === 0) log(`仍在加载中...（已等待 ${elapsed} 秒）`);
      setTimeout(check, 1000);
    };
    check();
  };

  // 5. Start UI server + open browser
  const startUI = () => {
    log("正在启动界面...");
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log(`[错误] 端口 ${UI_PORT} 已被其他程序占用。请关闭占用该端口的程序后重试。`);
        cleanup();
        process.exit(1);
      }
    });
    server.listen(UI_PORT, "127.0.0.1", () => {
      log("口袋龙虾已启动！");
      log(`浏览器地址: http://localhost:${UI_PORT}`);
      log("");
      log("关闭此窗口即可退出口袋龙虾");
      openBrowser(`http://localhost:${UI_PORT}`);
    });
  };

  waitForGateway();
} else {
  // Normal mode: just start the UI server (gateway managed by Go launcher)
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[口袋龙虾 UI] 错误: 端口 ${UI_PORT} 已被其他程序占用。请关闭占用该端口的程序后重试。`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(UI_PORT, "127.0.0.1", () => {
    console.log(`[口袋龙虾 UI] Server running at http://localhost:${UI_PORT}`);
    console.log(
      `[口袋龙虾 UI] Gateway proxy: ws://localhost:${UI_PORT}/ws -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`,
    );
  });
}
