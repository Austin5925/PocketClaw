const fs = require("fs");
const path = require("path");

const baseDir = process.argv[2] || path.resolve(__dirname, "..");
const configPath = path.join(baseDir, "data", ".openclaw", "openclaw.json");

function log(msg) {
  console.log(`[口袋龙虾] ${msg}`);
}

function migrate() {
  log("Starting migration...");

  if (!fs.existsSync(configPath)) {
    log("No config file found, skipping migration");
    return;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    log("Could not parse config, skipping migration");
    return;
  }

  let changed = false;

  if (!config.gateway) {
    config.gateway = { port: 18789, host: "127.0.0.1" };
    changed = true;
    log("Added default gateway config");
  }

  if (!config.webchat) {
    config.webchat = { enabled: true };
    changed = true;
    log("Added default webchat config");
  }

  if (!config.log) {
    config.log = { level: "info" };
    changed = true;
    log("Added default log config");
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    log("Config updated");
  } else {
    log("No migration needed");
  }
}

migrate();
