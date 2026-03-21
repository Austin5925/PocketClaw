/**
 * End-to-end provider chain integration tests.
 *
 * Verifies the full config → syncAuthProfiles → syncInternalConfig chain
 * for all 9 providers. Uses a real server instance with temp data directory.
 *
 * Tests:
 * 1. PUT config with provider API key → GET returns masked key
 * 2. auth-profiles.json written with correct OpenClaw provider name
 * 3. Internal openclaw.json has models.providers entry with baseUrl/api/models
 * 4. Masked key PUT does NOT overwrite real key
 * 5. Provider ID mapping (kimi→moonshot, glm→zhipu, doubao→volcengine, gemini→google)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

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

// ── Provider chain tests ────────────────────────────────────────────────────

/**
 * All 9 providers: UI config key, model string, expected OpenClaw provider name
 * in auth-profiles.json, and expected top-level key in models.providers.
 */
const PROVIDERS = [
  { uiKey: "minimax",  model: "minimax/MiniMax-M2.7",              openclawProvider: "minimax",    providerConfigKey: "minimax" },
  { uiKey: "deepseek", model: "deepseek/deepseek-chat",            openclawProvider: "deepseek",   providerConfigKey: "deepseek" },
  { uiKey: "kimi",     model: "moonshot/kimi-k2.5",                openclawProvider: "moonshot",   providerConfigKey: "moonshot" },
  { uiKey: "qwen",     model: "qwen/qwen3.5-plus",                 openclawProvider: "qwen",       providerConfigKey: "qwen" },
  { uiKey: "glm",      model: "zhipu/glm-5",                       openclawProvider: "zhipu",      providerConfigKey: "zhipu" },
  { uiKey: "openai",   model: "openai/gpt-4o-mini",                openclawProvider: "openai",     providerConfigKey: "openai" },
  { uiKey: "anthropic",model: "anthropic/claude-haiku-4-5",         openclawProvider: "anthropic",  providerConfigKey: "anthropic" },
  { uiKey: "doubao",   model: "volcengine/doubao-seed-2-0-pro-260215", openclawProvider: "volcengine", providerConfigKey: "volcengine" },
  { uiKey: "gemini",   model: "google/gemini-3.1-pro-preview",     openclawProvider: "google",     providerConfigKey: "google" },
];

describe("Provider chain — all 9 providers", () => {
  let serverProcess;
  let port;
  let tmpDir;
  let dataDir;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pocketclaw-chain-"));
    dataDir = path.join(tmpDir, "data");
    const configDir = path.join(dataDir, ".openclaw");
    const uiDir = path.join(tmpDir, "app", "ui", "dist");
    const systemDir = path.join(tmpDir, "system");

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(uiDir, { recursive: true });
    fs.mkdirSync(systemDir, { recursive: true });

    fs.writeFileSync(path.join(tmpDir, "version.txt"), "test\n");
    fs.writeFileSync(path.join(uiDir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(configDir, "openclaw.json"), "{}");

    // Copy real system files
    const realDir = path.join(__dirname, "..");
    fs.copyFileSync(path.join(realDir, "shared-config.json"), path.join(systemDir, "shared-config.json"));
    fs.copyFileSync(path.join(realDir, "ws-proxy.js"), path.join(systemDir, "ws-proxy.js"));
    fs.copyFileSync(path.join(realDir, "server.js"), path.join(systemDir, "server.js"));

    // Find free port
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
      env: { ...process.env, UI_PORT: String(port), GATEWAY_PORT: "19998", GATEWAY_HOST: "127.0.0.1" },
      cwd: systemDir,
      stdio: "pipe",
    });

    // Wait for ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 5000);
      const check = () => {
        http.get(`http://127.0.0.1:${port}/api/version`, (res) => {
          res.resume();
          clearTimeout(timeout);
          resolve();
        }).on("error", () => setTimeout(check, 100));
      };
      check();
    });
  });

  after(() => {
    if (serverProcess) serverProcess.kill("SIGTERM");
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to read internal files
  function readAuthProfiles() {
    const p = path.join(dataDir, ".openclaw", ".openclaw", "agents", "main", "agent", "auth-profiles.json");
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
  }

  function readInternalConfig() {
    const p = path.join(dataDir, ".openclaw", ".openclaw", "openclaw.json");
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
  }

  function readUserConfig() {
    const p = path.join(dataDir, ".openclaw", "openclaw.json");
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
  }

  // Test each provider
  for (const p of PROVIDERS) {
    it(`${p.uiKey}: full chain — PUT config → auth-profiles → internal config`, async () => {
      const testKey = `sk-test-${p.uiKey}-1234567890`;

      // PUT config with this provider's API key
      const putRes = await request(port, "PUT", "/api/config", {
        agent: { model: p.model },
        [p.uiKey]: { apiKey: testKey },
      });
      assert.equal(putRes.status, 200, `PUT failed for ${p.uiKey}`);

      // 1. GET returns masked key
      const getRes = await request(port, "GET", "/api/config");
      assert.equal(getRes.status, 200);
      const maskedKey = getRes.body[p.uiKey]?.apiKey;
      assert.ok(maskedKey, `No masked key returned for ${p.uiKey}`);
      assert.match(maskedKey, /^\*\*\*\*/, `Key not masked for ${p.uiKey}`);
      assert.ok(!maskedKey.includes("sk-test"), `Real key leaked for ${p.uiKey}`);

      // 2. auth-profiles.json has correct entry
      const authProfiles = readAuthProfiles();
      assert.ok(authProfiles, "auth-profiles.json not created");
      const profileKey = `${p.openclawProvider}:default`;
      const profile = authProfiles.profiles[profileKey];
      assert.ok(profile, `No auth profile for ${profileKey}`);
      assert.equal(profile.provider, p.openclawProvider, `Wrong provider name for ${p.uiKey}`);
      assert.equal(profile.key, testKey, `Wrong API key in auth profile for ${p.uiKey}`);
      assert.equal(profile.type, "api_key");

      // 3. Internal config has models.providers entry
      const internal = readInternalConfig();
      assert.ok(internal, "Internal openclaw.json not created");
      const providerEntry = internal.models?.providers?.[p.providerConfigKey];
      assert.ok(providerEntry, `No models.providers.${p.providerConfigKey}`);
      assert.ok(providerEntry.baseUrl, `No baseUrl for ${p.providerConfigKey}`);
      assert.ok(Array.isArray(providerEntry.models), `No models array for ${p.providerConfigKey}`);
      assert.ok(providerEntry.models.length > 0, `Empty models for ${p.providerConfigKey}`);
    });
  }

  it("masked key PUT does NOT overwrite real key", async () => {
    // First, set a real key
    const realKey = "sk-real-key-that-must-survive-9999";
    await request(port, "PUT", "/api/config", {
      agent: { model: "minimax/MiniMax-M2.7" },
      minimax: { apiKey: realKey },
    });

    // GET returns masked
    const getRes = await request(port, "GET", "/api/config");
    assert.match(getRes.body.minimax.apiKey, /^\*\*\*\*9999$/);

    // PUT back the masked config (simulating frontend deepMerge behavior)
    const maskedConfig = getRes.body;
    maskedConfig.agent = { model: "deepseek/deepseek-chat" };
    maskedConfig.deepseek = { apiKey: "sk-new-deepseek-key-abcd" };
    await request(port, "PUT", "/api/config", maskedConfig);

    // Verify real minimax key survived
    const userConfig = readUserConfig();
    assert.equal(userConfig.minimax.apiKey, realKey, "Real key was overwritten by masked value!");

    // Also verify auth-profiles still has the real key
    const authProfiles = readAuthProfiles();
    assert.equal(authProfiles.profiles["minimax:default"].key, realKey);
  });

  it("all 9 providers have models.providers entries after sequential setup", async () => {
    // Set up all providers at once
    const config = { agent: { model: "minimax/MiniMax-M2.7" } };
    for (const p of PROVIDERS) {
      config[p.uiKey] = { apiKey: `sk-all-${p.uiKey}-test` };
    }
    await request(port, "PUT", "/api/config", config);

    const internal = readInternalConfig();
    const providerKeys = Object.keys(internal.models?.providers ?? {});

    // All 9 provider config keys should exist
    const expectedKeys = [...new Set(PROVIDERS.map((p) => p.providerConfigKey))];
    for (const key of expectedKeys) {
      assert.ok(
        providerKeys.includes(key),
        `Missing models.providers.${key}. Have: ${providerKeys.join(", ")}`,
      );
    }
  });
});
