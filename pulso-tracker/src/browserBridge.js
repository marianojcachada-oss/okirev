const http = require("http");

const PORT = 17342;
const STALE_MS = 30000; // ignore tab info older than this (extension likely not running/tab closed)

let currentTab = null; // { url, hostname, title, updatedAt }
let server = null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function startBridgeServer() {
  if (server) return server;

  server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (req.method === "POST" && req.url === "/tab-update") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10000) req.destroy(); // guard against abuse
      });
      req.on("end", () => {
        try {
          const { url, title } = JSON.parse(body);
          const hostname = new URL(url).hostname.replace(/^www\./, "");
          currentTab = { url, hostname, title: title || "", updatedAt: Date.now() };
          res.writeHead(200, corsHeaders());
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, corsHeaders());
          res.end(JSON.stringify({ error: "Cuerpo inválido" }));
        }
      });
      return;
    }

    res.writeHead(404, corsHeaders());
    res.end(JSON.stringify({ error: "No encontrado" }));
  });

  server.listen(PORT, "127.0.0.1");
  return server;
}

function stopBridgeServer() {
  if (server) {
    server.close();
    server = null;
  }
}

// Returns the current tab info, or null if the extension hasn't reported anything
// recently (extension not installed, browser not focused in a while, etc).
function getCurrentBrowserTab() {
  if (currentTab && Date.now() - currentTab.updatedAt < STALE_MS) {
    return currentTab;
  }
  return null;
}

module.exports = { startBridgeServer, stopBridgeServer, getCurrentBrowserTab, PORT };
