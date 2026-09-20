const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const { readConfig, writeConfig } = require("./store");
const tracker = require("./tracker");
const { startBridgeServer, stopBridgeServer } = require("./browserBridge");

let mainWindow;
let tray;
let isQuitting = false;

const FULL_SIZE = { width: 380, height: 640 };
const COMPACT_SIZE = { width: 300, height: 210 };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_SIZE.width,
    height: FULL_SIZE.height,
    resizable: false,
    maximizable: false,
    title: "OKlrev Tracker",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    backgroundColor: "#12141A",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#12141A", symbolColor: "#F1F2F4", height: 40 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "renderer", "assets", "tray-icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("OKlrev Tracker");

  const menu = Menu.buildFromTemplate([
    { label: "Mostrar OKlrev", click: () => showFromTray() },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showFromTray());
}

function showFromTray() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let pendingVersion = null;

  autoUpdater.on("update-available", (info) => {
    pendingVersion = info.version;
    if (mainWindow) mainWindow.webContents.send("update:status", { state: "downloading", version: info.version, percent: 0 });
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:status", {
        state: "downloading",
        version: pendingVersion,
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    pendingVersion = null;
    if (mainWindow) mainWindow.webContents.send("update:status", { state: "ready", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow) mainWindow.webContents.send("update:status", { state: "up-to-date" });
  });

  autoUpdater.on("error", (err) => {
    console.error("Error buscando actualizaciones:", err.message);
    if (mainWindow) mainWindow.webContents.send("update:status", { state: "error", message: err.message });
  });

  ipcMain.handle("update:install", () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("update:check-now", () => {
    if (mainWindow) mainWindow.webContents.send("update:status", { state: "checking" });
    autoUpdater.checkForUpdates().catch((err) => {
      if (mainWindow) mainWindow.webContents.send("update:status", { state: "error", message: err.message });
    });
  });

  autoUpdater.checkForUpdates().catch((err) => console.error("No se pudo chequear actualizaciones:", err.message));
  // Vuelve a chequear cada 4 horas, ya que la app suele quedar abierta toda la jornada.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startBridgeServer();
  setupAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  tracker.stop();
  stopBridgeServer();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => readConfig());
ipcMain.handle("config:set", (_event, data) => writeConfig(data));
ipcMain.handle("dashboard:open", (_event, url) => shell.openExternal(url));
ipcMain.handle("system:hostname", () => os.hostname());

ipcMain.handle("window:minimize-to-tray", () => {
  if (mainWindow) mainWindow.hide();
  return true;
});

ipcMain.handle("window:set-compact-mode", (_event, compact) => {
  if (!mainWindow) return false;
  const size = compact ? COMPACT_SIZE : FULL_SIZE;
  mainWindow.setResizable(true); // setSize can be finicky on a non-resizable window on some platforms
  mainWindow.setSize(size.width, size.height);
  mainWindow.setResizable(false);
  return true;
});

const TITLEBAR_COLORS = {
  oscuro: { color: "#12141a", symbolColor: "#f1f2f4" },
  claro: { color: "#ffffff", symbolColor: "#171923" },
  "alto-contraste": { color: "#000000", symbolColor: "#ffffff" },
  medianoche: { color: "#121a35", symbolColor: "#e9ebff" },
};

ipcMain.handle("window:set-theme", (_event, themeId) => {
  if (!mainWindow) return false;
  const colors = TITLEBAR_COLORS[themeId] || TITLEBAR_COLORS.oscuro;
  mainWindow.setTitleBarOverlay({ ...colors, height: 40 });
  return true;
});

ipcMain.handle("app:get-version", () => app.getVersion());

/* ---------------- Activity tracking ---------------- */

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function authHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const syncLogPath = path.join(os.tmpdir(), "oklrev-sync-debug.txt");
function logSyncIssue(context, detail) {
  try {
    const line = `${new Date().toISOString()} | ${context} | ${detail}\n`;
    if (fs.existsSync(syncLogPath) && fs.statSync(syncLogPath).size > 50000) {
      const tail = fs.readFileSync(syncLogPath, "utf-8").slice(-20000);
      fs.writeFileSync(syncLogPath, tail, "utf-8");
    }
    fs.appendFileSync(syncLogPath, line, "utf-8");
  } catch {}
}

ipcMain.handle("log:issue", (_event, context, detail) => {
  logSyncIssue(context, detail);
});

ipcMain.handle("tracking:start", (_event, payload) => {
  const { apiUrl, employeeId, sessionToken, idleThresholdMinutes } = payload;

  tracker.start({
    idleThresholdMinutes,
    flushCallback: async (record) => {
      try {
        const body = {
          app: record.app,
          duration: formatDuration(record.durationMs),
        };
        if (record.category) body.category = record.category; // only set for "Inactivo"; otherwise the backend resolves it from the catalog
        const res = await fetch(`${apiUrl}/activities`, {
          method: "POST",
          headers: authHeaders(sessionToken),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          logSyncIssue("POST /activities", `HTTP ${res.status} — ${text.slice(0, 300)} — app enviada: ${record.app}`);
        }
      } catch (err) {
        console.error("No se pudo enviar actividad:", err.message);
        logSyncIssue("POST /activities", `error de red: ${err.message}`);
      }
    },
    statusCallback: async ({ status, app: appLabel }) => {
      if (mainWindow) {
        mainWindow.webContents.send("tracking:update", { status, app: appLabel });
      }
      try {
        const res = await fetch(`${apiUrl}/employees/${employeeId}`, {
          method: "PATCH",
          headers: authHeaders(sessionToken),
          body: JSON.stringify({ status, app: appLabel }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          logSyncIssue("PATCH /employees", `HTTP ${res.status} — ${text.slice(0, 300)}`);
        }
      } catch (err) {
        console.error("No se pudo actualizar el estado del empleado:", err.message);
        logSyncIssue("PATCH /employees", `error de red: ${err.message}`);
      }
    },
  });

  return true;
});

ipcMain.handle("tracking:stop", () => {
  tracker.stop();
  return true;
});

ipcMain.handle("tracking:update-settings", (_event, payload) => {
  tracker.updateSettings(payload);
  return true;
});

