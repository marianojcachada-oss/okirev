const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function configPath() {
  return path.join(app.getPath("userData"), "pulso-config.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), "utf-8");
  return data;
}

module.exports = { readConfig, writeConfig };
