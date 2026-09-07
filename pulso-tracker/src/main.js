const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const os = require("os");
const { readConfig, writeConfig } = require("./store");
const tracker = require("./tracker");
const { startBridgeServer, stopBridgeServer } = require("./browserBridge");

let mainWindow;
let tray;
let isQuitting = false;

const FULL_SIZE = { width: 380, height: 640 };
const COMPACT_SIZE = { width: 300, height: 190 };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_SIZE.width,
    height: FULL_SIZE.height,
    resizable: false,
    maximizable: false,
    title: "OKlrev Tracker",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    backgroundColor: "#12141A",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
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

app.whenReady().then(() => {
  createWindow();
  createTray();
  startBridgeServer();

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

ipcMain.handle("tracking:start", (_event, payload) => {
  const { apiUrl, employeeId, deviceToken, idleThresholdMinutes } = payload;

  tracker.start({
    idleThresholdMinutes,
    flushCallback: async (record) => {
      try {
        const body = {
          employeeId,
          app: record.app,
          duration: formatDuration(record.durationMs),
        };
        if (record.category) body.category = record.category; // only set for "Inactivo"; otherwise the backend resolves it from the catalog
        await fetch(`${apiUrl}/activities`, {
          method: "POST",
          headers: authHeaders(deviceToken),
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error("No se pudo enviar actividad:", err.message);
      }
    },
    statusCallback: async ({ status, app: appLabel }) => {
      if (mainWindow) {
        mainWindow.webContents.send("tracking:update", { status, app: appLabel });
      }
      try {
        await fetch(`${apiUrl}/employees/${employeeId}`, {
          method: "PATCH",
          headers: authHeaders(deviceToken),
          body: JSON.stringify({ status, app: appLabel }),
        });
      } catch (err) {
        console.error("No se pudo actualizar el estado del empleado:", err.message);
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

