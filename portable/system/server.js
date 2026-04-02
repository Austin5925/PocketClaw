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

  // NOTE: browser, canvasHost, discovery.mdns, update.checkOnStart are NOT in
  // OpenClaw's config file Zod schema (they're CLI/runtime params). Writing them
  // to openclaw.json causes Zod strict() validation failure → gateway crash.
  // These are disabled via env vars in the gateway spawn call instead.

  // Explicitly set workspace path so OpenClaw finds ClawHub skills.
  // Without this, OpenClaw defaults to ~/.openclaw/workspace/ which
  // doesn't contain the bundled skills we installed to $OPENCLAW_HOME/workspace/.
  const workspacePath = path.join(DATA_DIR, ".openclaw", "workspace");
  internal.agents.defaults.workspace = workspacePath;

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
    // Merge models: keep user-added models from OpenClaw, add ours if missing
    const existingModels = Array.isArray(existing.models) ? existing.models : [];
    const sharedModels = Array.isArray(providerCfg.models) ? providerCfg.models : [];
    const mergedModelIds = new Set(existingModels.map((m) => m.id || m));
    const mergedModels = [...existingModels];
    for (const m of sharedModels) {
      if (!mergedModelIds.has(m.id || m)) {
        mergedModels.push(m);
      }
    }

    internal.models.providers[providerKey] = {
      ...existing,
      baseUrl: providerCfg.baseUrl,
      apiKey: apiKey ?? existing.apiKey,
      api: providerCfg.api,
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
        syncInternalConfig(parsed, { updateModel: modelChanged });

        // Delay restart 500ms to let chokidar complete its hot-reload cycle (300ms debounce).
        // Without this delay, the gateway restart races with hot-reload and may cache stale model.
        const needsRestart = modelChanged || channelsChanged;
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${UI_PORT}`);
  const pathname = url.pathname;

  if (pathname === "/api/config") return handleApiConfig(req, res);
  if (pathname === "/api/validate-key") return handleApiValidateKey(req, res);
  if (pathname === "/api/version") return handleApiVersion(res);
  if (pathname === "/api/openclaw-version") return handleApiOpenclawVersion(res);
  if (pathname === "/api/health") return handleApiHealth(res);
  if (pathname === "/api/update" && req.method === "POST")
    return handleApiUpdate(req, res);
  if (pathname === "/api/update/status") return handleApiUpdateStatus(res);
  if (pathname === "/api/openclaw-check") return handleApiOpenclawCheck(res);

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

  // 3. Start gateway
  log("正在启动 AI 引擎...");
  let gatewayProcess = spawn(
    process.execPath,
    [openclawEntry, "gateway", "--port", String(GATEWAY_PORT), "--allow-unconfigured"],
    {
      cwd: BASE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        OPENCLAW_HOME: path.join(DATA_DIR, ".openclaw"),
        // Pass through proxy settings so OpenClaw can reach overseas APIs
        // Proxy passthrough
        ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
        ...(process.env.HTTP_PROXY ? { HTTP_PROXY: process.env.HTTP_PROXY } : {}),
        ...(process.env.ALL_PROXY ? { ALL_PROXY: process.env.ALL_PROXY } : {}),
        ...(process.env.NO_PROXY ? { NO_PROXY: process.env.NO_PROXY } : {}),
        // Disable non-consumer features via env vars (NOT config file — Zod strict rejects unknown keys)
        OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: "1",
        OPENCLAW_DISABLE_BONJOUR: "1",
        OPENCLAW_SKIP_CANVAS_HOST: "1",
      },
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
    if (gatewayRestarting) {
      // Windows model-switch restart: re-spawn the gateway
      gatewayRestarting = false;
      log("[gateway] 模型已切换，正在重启 AI 引擎...");
      const newGw = spawn(
        process.execPath,
        [openclawEntry, "gateway", "--port", String(GATEWAY_PORT), "--allow-unconfigured"],
        { cwd: BASE_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OPENCLAW_HOME: path.join(DATA_DIR, ".openclaw") } },
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
