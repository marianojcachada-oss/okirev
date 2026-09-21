const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pulso", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (data) => ipcRenderer.invoke("config:set", data),
  openDashboard: (url) => ipcRenderer.invoke("dashboard:open", url),
  getHostname: () => ipcRenderer.invoke("system:hostname"),
  startTracking: (payload) => ipcRenderer.invoke("tracking:start", payload),
  stopTracking: () => ipcRenderer.invoke("tracking:stop"),
  updateTrackingSettings: (payload) => ipcRenderer.invoke("tracking:update-settings", payload),
  minimizeToTray: () => ipcRenderer.invoke("window:minimize-to-tray"),
  setCompactMode: (compact) => ipcRenderer.invoke("window:set-compact-mode", compact),
  setWindowTheme: (themeId) => ipcRenderer.invoke("window:set-theme", themeId),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  checkForUpdatesNow: () => ipcRenderer.invoke("update:check-now"),
  logIssue: (context, detail) => ipcRenderer.invoke("log:issue", context, detail),
  getScreenSourceId: () => ipcRenderer.invoke("recording:get-source"),
  onTrackingUpdate: (callback) => {
    ipcRenderer.on("tracking:update", (_event, data) => callback(data));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update:status", (_event, data) => callback(data));
  },
});
