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

const SHARED_CONFIG = JSON.parse(
  fs.readFileSync(path.join(SCRIPT_DIR, "shared-config.json"), "utf-8"),
);
const KNOWN_PROVIDERS = SHARED_CONFIG.providers.map((p) => p.id);

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    const headers = { "Content-Type": contentType };
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

// Map our UI provider IDs to OpenClaw provider names.
// OpenClaw resolves auth by matching the provider field in auth-profiles
// against the model string prefix (e.g. "moonshot/kimi-k2.5" → provider "moonshot").
const OPENCLAW_PROVIDER = { kimi: "moonshot", glm: "zhipu" };

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
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "auth-profiles.json"),
    JSON.stringify(store, null, 2),
    "utf-8",
  );
}

// Map our UI provider IDs to the config key in the user's config object.
// e.g. OpenClaw provider "moonshot" → user config key "kimi"
const CONFIG_KEY_FOR_PROVIDER = { moonshot: "kimi", zhipu: "glm" };

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

  fs.mkdirSync(internalDir, { recursive: true });
  fs.writeFileSync(
    internalPath,
    JSON.stringify(internal, null, 2),
    "utf-8",
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(maskApiKeys(raw)));
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Config not found" }));
    }
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    readBody(req, res, (body) => {
      try {
        const parsed = JSON.parse(body);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, body, "utf-8");

        // Sync to OpenClaw auth store and internal config
        syncAuthProfiles(parsed);
        syncInternalConfig(parsed);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(405);
  res.end();
}

function handleApiVersion(res) {
  const versionPath = path.join(BASE_DIR, "version.txt");
  try {
    const version = fs.readFileSync(versionPath, "utf-8").trim();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ version }));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Version file not found" }));
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
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ui: "ok",
            gateway: "ok",
            gatewayResponse: data,
          }),
        );
      });
    })
    .on("error", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ui: "ok", gateway: "unreachable" }));
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
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ valid: false, error: "API Key 无效，请检查后重试" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ valid: true }));
    }
  });

  apiReq.on("error", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ valid: true }));
  });

  apiReq.on("timeout", () => {
    apiReq.destroy();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ valid: true }));
  });

  if (postData) apiReq.write(postData);
  apiReq.end();
}

function handleApiValidateKey(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  readBody(req, res, (body) => {
    try {
      const { provider, apiKey, model } = JSON.parse(body);
      const validator = PROVIDER_VALIDATORS[provider];
      if (!validator || !apiKey) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: true }));
        return;
      }
      validateKeyRequest(validator, apiKey, model, res);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request" }));
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

  res.writeHead(404);
  res.end("Not Found");
});

server.on("upgrade", (req, socket, head) => {
  createProxyServer(req, socket, head, GATEWAY_HOST, GATEWAY_PORT);
});

server.listen(UI_PORT, "127.0.0.1", () => {
  console.log(`[PocketClaw UI] Server running at http://localhost:${UI_PORT}`);
  console.log(
    `[PocketClaw UI] Gateway proxy: ws://localhost:${UI_PORT}/ws -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`,
  );
});
