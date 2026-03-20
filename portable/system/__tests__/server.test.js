/**
 * Integration tests for PocketClaw server API endpoints.
 * Uses Node.js built-in test runner (node --test).
 *
 * Starts the actual server on a random port, sends real HTTP requests,
 * and verifies responses. Uses a temp directory for data isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");

// ── Helpers ──────────────────────────────────────────────────────────────────

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ── maskApiKeys unit tests (extracted logic) ────────────────────────────────

describe("maskApiKeys", () => {
  // Re-implement the function here since server.js doesn't export it
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

  it("masks long API keys to last 4 chars", () => {
    const result = maskApiKeys({ apiKey: "sk-1234567890abcdef" });
    assert.equal(result.apiKey, "****cdef");
  });

  it("masks short API keys completely", () => {
    const result = maskApiKeys({ apiKey: "ab" });
    assert.equal(result.apiKey, "****");
  });

  it("masks nested API keys", () => {
    const result = maskApiKeys({
      minimax: { apiKey: "sk-minimax-test1234" },
      deepseek: { apiKey: "sk-deep-abcd5678" },
    });
    assert.equal(result.minimax.apiKey, "****1234");
    assert.equal(result.deepseek.apiKey, "****5678");
  });

  it("preserves non-apiKey fields", () => {
    const result = maskApiKeys({ model: "minimax/M2.7", apiKey: "secret12345" });
    assert.equal(result.model, "minimax/M2.7");
    assert.equal(result.apiKey, "****2345");
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(maskApiKeys(null), null);
    assert.equal(maskApiKeys(undefined), undefined);
  });
});

// ── Server integration tests ────────────────────────────────────────────────

describe("Server API", () => {
  let serverProcess;
  let port;
  let tmpDir;

  before(async () => {
    // Create isolated temp directory structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pocketclaw-test-"));
    const dataDir = path.join(tmpDir, "data");
    const configDir = path.join(dataDir, ".openclaw");
    const uiDir = path.join(tmpDir, "app", "ui", "dist");
    const systemDir = path.join(tmpDir, "system");

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });
    fs.mkdirSync(systemDir, { recursive: true });

    // Write version.txt
    fs.writeFileSync(path.join(tmpDir, "version.txt"), "1.0.0-test\n");

    // Write minimal index.html
    fs.writeFileSync(path.join(uiDir, "index.html"), "<html><body>test</body></html>");

    // Write initial config
    fs.writeFileSync(
      path.join(configDir, "openclaw.json"),
      JSON.stringify({
        agent: { model: "minimax/MiniMax-M2.7" },
        minimax: { apiKey: "sk-test-minimax-key-1234" },
      }),
    );

    // Copy shared-config.json from real system dir
    const realSharedConfig = path.join(__dirname, "..", "shared-config.json");
    fs.copyFileSync(realSharedConfig, path.join(systemDir, "shared-config.json"));

    // Copy ws-proxy.js
    const realWsProxy = path.join(__dirname, "..", "ws-proxy.js");
    fs.copyFileSync(realWsProxy, path.join(systemDir, "ws-proxy.js"));

    // Copy server.js
    const realServerJs = path.join(__dirname, "..", "server.js");
    fs.copyFileSync(realServerJs, path.join(systemDir, "server.js"));

    // Find a free port
    port = await new Promise((resolve) => {
      const s = http.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
    });

    // Start server
    const { spawn } = require("node:child_process");
    serverProcess = spawn(process.execPath, [path.join(systemDir, "server.js")], {
      env: {
        ...process.env,
        UI_PORT: String(port),
        GATEWAY_PORT: "19999", // Deliberately unreachable for test isolation
        GATEWAY_HOST: "127.0.0.1",
      },
      cwd: systemDir,
      stdio: "pipe",
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 5000);
      const check = () => {
        http
          .get(`http://127.0.0.1:${port}/api/version`, (res) => {
            res.resume();
            clearTimeout(timeout);
            resolve();
          })
          .on("error", () => setTimeout(check, 100));
      };
      check();
    });
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── /api/version ──

  it("GET /api/version returns version string", async () => {
    const res = await request(port, "GET", "/api/version");
    assert.equal(res.status, 200);
    assert.equal(res.body.version, "1.0.0-test");
  });

  // ── /api/health ──

  it("GET /api/health returns ui=ok and gateway=unreachable", async () => {
    const res = await request(port, "GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ui, "ok");
    assert.equal(res.body.gateway, "unreachable"); // No gateway running in test
  });

  // ── /api/config GET ──

  it("GET /api/config returns config with masked API keys", async () => {
    const res = await request(port, "GET", "/api/config");
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.model, "minimax/MiniMax-M2.7");
    // API key must be masked
    assert.match(res.body.minimax.apiKey, /^\*\*\*\*/);
    assert.ok(!res.body.minimax.apiKey.includes("sk-test"));
  });

  // ── /api/config PUT ──

  it("PUT /api/config saves and returns success", async () => {
    const newConfig = {
      agent: { model: "deepseek/deepseek-chat" },
      deepseek: { apiKey: "sk-deepseek-new-key-5678" },
    };
    const putRes = await request(port, "PUT", "/api/config", newConfig);
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.success, true);

    // Verify GET returns updated config with masked key
    const getRes = await request(port, "GET", "/api/config");
    assert.equal(getRes.body.agent.model, "deepseek/deepseek-chat");
    assert.match(getRes.body.deepseek.apiKey, /^\*\*\*\*5678$/);
  });

  it("PUT /api/config rejects invalid JSON", async () => {
    const res = await request(port, "PUT", "/api/config", "not-json{{{");
    assert.equal(res.status, 400);
  });

  it("DELETE /api/config returns 405", async () => {
    const res = await request(port, "DELETE", "/api/config");
    assert.equal(res.status, 405);
  });

  // ── /api/validate-key ──

  it("POST /api/validate-key with unknown provider returns valid=true", async () => {
    const res = await request(port, "POST", "/api/validate-key", {
      provider: "unknown-provider",
      apiKey: "test-key",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
  });

  it("POST /api/validate-key rejects non-POST", async () => {
    const res = await request(port, "GET", "/api/validate-key");
    assert.equal(res.status, 405);
  });

  // ── Static file serving ──

  it("GET / serves index.html", async () => {
    const res = await request(port, "GET", "/");
    assert.equal(res.status, 200);
    assert.ok(res.raw.includes("<html>"));
  });

  // ── SPA fallback ──

  it("GET /unknown-route falls back to index.html", async () => {
    const res = await request(port, "GET", "/some/unknown/route");
    assert.equal(res.status, 200);
    assert.ok(res.raw.includes("<html>"));
  });
});
