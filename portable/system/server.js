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

const KNOWN_PROVIDERS = [
  "minimax",
  "deepseek",
  "kimi",
  "moonshot",
  "qwen",
  "anthropic",
  "openai",
  "glm",
  "zhipu",
];

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    return false;
  }
  return true;
}

/**
 * Write auth-profiles.json for the agent auth store.
 * Format verified from OpenClaw source: src/agents/auth-profiles/types.ts
 */
function syncAuthProfiles(config) {
  const profiles = {};
  for (const provider of KNOWN_PROVIDERS) {
    const apiKey = config[provider]?.apiKey;
    if (apiKey) {
      profiles[`${provider}:default`] = {
        type: "api_key",
        provider,
        key: apiKey,
      };
    }
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

/**
 * Sync model + MiniMax CN base URL to OpenClaw's internal config.
 * API keys go through auth-profiles.json only.
 * MiniMax provider needs COMPLETE entry (baseUrl, api, models) to pass Zod strict.
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

  // Override MiniMax to China endpoint (api.minimaxi.com).
  // Default is api.minimax.io (international) — CN API keys get 401 there.
  if (!internal.models) internal.models = {};
  if (!internal.models.providers) internal.models.providers = {};
  internal.models.providers.minimax = {
    baseUrl: "https://api.minimaxi.com/anthropic",
    api: "anthropic-messages",
    models: [
      { id: "MiniMax-M2.7", name: "MiniMax M2.7" },
      { id: "MiniMax-M2.7-highspeed", name: "MiniMax M2.7 Highspeed" },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
      { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 Highspeed" },
    ],
  };

  fs.mkdirSync(internalDir, { recursive: true });
  fs.writeFileSync(
    internalPath,
    JSON.stringify(internal, null, 2),
    "utf-8",
  );
}

function handleApiConfig(req, res) {
  const configPath = path.join(DATA_DIR, ".openclaw", "openclaw.json");

  if (req.method === "GET") {
    try {
      const config = fs.readFileSync(configPath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(config);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Config not found" }));
    }
    return;
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
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

const PROVIDER_API_URLS = {
  minimax: "https://api.minimaxi.com/anthropic/v1/messages",
};

function handleApiValidateKey(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { provider, apiKey, model } = JSON.parse(body);
      const apiUrl = PROVIDER_API_URLS[provider];
      if (!apiUrl || !apiKey) {
        // No validation URL for this provider — assume valid
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: true }));
        return;
      }

      const modelId = (model || "").split("/")[1] || "MiniMax-M2.7";
      const https = require("https");
      const postData = JSON.stringify({
        model: modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });

      const urlObj = new URL(apiUrl);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 10000,
      };

      const apiReq = https.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", (chunk) => (data += chunk));
        apiRes.on("end", () => {
          if (apiRes.statusCode === 401) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ valid: false, error: "API Key 无效，请检查后重试" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ valid: true }));
          }
        });
      });

      apiReq.on("error", () => {
        // Network error — skip validation, assume valid
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: true }));
      });

      apiReq.on("timeout", () => {
        apiReq.destroy();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ valid: true }));
      });

      apiReq.write(postData);
      apiReq.end();
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

server.listen(UI_PORT, () => {
  console.log(`[PocketClaw UI] Server running at http://localhost:${UI_PORT}`);
  console.log(
    `[PocketClaw UI] Gateway proxy: ws://localhost:${UI_PORT}/ws -> ws://${GATEWAY_HOST}:${GATEWAY_PORT}`,
  );
});
