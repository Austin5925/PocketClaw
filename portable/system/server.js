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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self'",
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
function syncInternalConfig(config) {
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

  const model = config.agent?.model;
  if (model) {
    if (!internal.agents) internal.agents = {};
    if (!internal.agents.defaults) internal.agents.defaults = {};
    internal.agents.defaults.model = model;
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

    internal.models.providers[providerKey] = {
      baseUrl: providerCfg.baseUrl,
      apiKey: apiKey ?? undefined,
      api: providerCfg.api,
      models: providerCfg.models,
    };
  }

  fs.mkdirSync(internalDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    internalPath,
    JSON.stringify(internal, null, 2),
    { encoding: "utf-8", mode: 0o600 },
  );
}

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
        fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(configPath, body, { encoding: "utf-8", mode: 0o600 });

        // Sync to OpenClaw auth store and internal config
        syncAuthProfiles(parsed);
        syncInternalConfig(parsed);

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
    const modelId = (model || "").split("/")[1] || (validator.auth === "x-api-key" ? "MiniMax-M2.7" : "claude-3-5-haiku-20241022");
    postData = JSON.stringify({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    options.headers["Content-Length"] = Buffer.byteLength(postData);
  }

  const apiReq = https.request(options, (apiRes) => {
    apiRes.resume(); // drain body
    if (apiRes.statusCode === 401 || apiRes.statusCode === 403) {
      jsonResponse(res, 200, { valid: false, error: "API Key 无效，请检查后重试" });
    } else {
      jsonResponse(res, 200, { valid: true });
    }
  });

  apiReq.on("error", () => {
    jsonResponse(res, 200, { valid: true });
  });

  apiReq.on("timeout", () => {
    apiReq.destroy();
    jsonResponse(res, 200, { valid: true });
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
  if (pathname === "/api/health") return handleApiHealth(res);

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

  if (config && Object.keys(config).length > 0) {
    syncAuthProfiles(config);
    syncInternalConfig(config);
    log("配置同步完成");
  }

  // 2. Find OpenClaw
  const openclawEntry = findOpenClawEntry();
  if (!openclawEntry) {
    log("[错误] AI 引擎未找到，请确认文件完整。");
    process.exit(1);
  }

  // 3. Start gateway
  log("正在启动 AI 引擎...");
  const gatewayProcess = spawn(
    process.execPath,
    [openclawEntry, "gateway", "--port", String(GATEWAY_PORT), "--allow-unconfigured"],
    { cwd: BASE_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  gatewayProcess.stdout.on("data", () => {});
  gatewayProcess.stderr.on("data", () => {});

  // Cleanup on exit
  const cleanup = () => {
    if (gatewayProcess && !gatewayProcess.killed) gatewayProcess.kill();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  gatewayProcess.on("exit", (code) => {
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
    server.listen(UI_PORT, "127.0.0.1", () => {
      log("PocketClaw 已启动！");
      log(`浏览器地址: http://localhost:${UI_PORT}`);
      log("");
      log("关闭此窗口即可退出 PocketClaw");
      openBrowser(`http://localhost:${UI_PORT}`);
    });
  };

  waitForGateway();
} else {
  // Normal mode: just start the UI server (gateway managed by Go launcher)
  server.listen(UI_PORT, "127.0.0.1", () => {
    console.log(`[PocketClaw UI] Server running at http://localhost:${UI_PORT}`);
    console.log(
      `[PocketClaw UI] Gateway proxy: ws://localhost:${UI_PORT}/ws -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`,
    );
  });
}
