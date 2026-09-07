const { powerMonitor } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCurrentBrowserTab } = require("./browserBridge");

const execFileAsync = promisify(execFile);

const BROWSER_PROCESSES = ["chrome", "msedge", "firefox", "brave", "opera"];

const POLL_MS = 10000; // check the active window every 10s
const FORCE_FLUSH_MS = 60000; // send a partial update at least every 60s, even mid-session
const MIN_SEGMENT_MS = 3000; // ignore slivers shorter than this (noise from rapid app-switching)

// Calls the Win32 GetForegroundWindow API via a small embedded C# snippet run through
// PowerShell. No native Node module, no compiled binaries — works on any stock Windows
// install. The script is written to a real .ps1 file and run with -File (not -Command with
// the script inlined as a string), because passing a multi-line script with quotes through
// cmd.exe -> powershell.exe as a single command-line argument is fragile and can fail silently
// depending on Windows/PowerShell version. Adds ~100-300ms per poll to spawn PowerShell, which
// is fine at a 10s interval.
const FOREGROUND_WINDOW_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PulsoWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$hwnd = [PulsoWin32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[PulsoWin32]::GetWindowText($hwnd, $sb, 512) | Out-Null
$procId = 0
[PulsoWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = "desconocido" }
Write-Output "$name|$($sb.ToString())"
`;

let scriptPath = null;

function ensureScriptFile() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oklrev-"));
  scriptPath = path.join(dir, "foreground-window.ps1");
  fs.writeFileSync(scriptPath, FOREGROUND_WINDOW_SCRIPT, "utf-8");
  return scriptPath;
}

async function getForegroundWindow() {
  if (process.platform !== "win32") {
    return { app: "No soportado en esta plataforma", title: "" };
  }
  try {
    const script = ensureScriptFile();
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { timeout: 5000, windowsHide: true, encoding: "utf8" }
    );
    const [procName, ...titleParts] = stdout.trim().split("|");
    return { app: procName || "Desconocido", title: titleParts.join("|").trim() };
  } catch (err) {
    console.error("getForegroundWindow falló:", err.message);
    return { app: "Desconocido", title: "" };
  }
}

let pollInterval = null;
let currentSegment = null; // { label, category, startedAt }
let idleThresholdSeconds = 300;
let onFlush = null; // (record) => void
let onStatusChange = null; // ({status, app}) => void

function formatLabel({ app: procName, title }) {
  return title ? `${procName} — ${title}` : procName;
}

// Browser tab titles for web apps (Teams, Slack, etc.) often look like:
// "(1057) Chat | Vista compacta de la reunión | Reunión en X | Microsoft Teams - Opera"
// Everything before the last "|" is dynamic noise (chat previews, meeting names); the part
// after it ("Microsoft Teams - Opera") reliably identifies the site/app. Only used as a
// fallback when the extension hasn't reported a real hostname for this tab.
function simplifyBrowserTitle(title) {
  if (!title) return title;
  const parts = title.split("|");
  return parts[parts.length - 1].trim();
}

function categorize(isIdle) {
  return isIdle ? "Inactivo" : null; // null = let the backend resolve it from the catalog
}

function flush(endTime) {
  if (!currentSegment) return;
  const durationMs = endTime - currentSegment.startedAt;
  if (durationMs >= MIN_SEGMENT_MS && onFlush) {
    onFlush({
      app: currentSegment.label,
      category: currentSegment.category,
      durationMs,
    });
  }
}

async function tick() {
  let isIdle = false;
  try {
    isIdle = powerMonitor.getSystemIdleTime() >= idleThresholdSeconds;
  } catch {
    isIdle = false;
  }

  let label = "Desconocido";
  if (!isIdle) {
    try {
      const win = await getForegroundWindow();
      const isBrowser = BROWSER_PROCESSES.some((p) => win.app.toLowerCase().includes(p));
      if (isBrowser) {
        const tab = getCurrentBrowserTab();
        label = tab ? `${win.app} — ${tab.hostname}` : formatLabel({ app: win.app, title: simplifyBrowserTitle(win.title) });
      } else {
        label = formatLabel(win);
      }
    } catch {
      label = "Desconocido";
    }
  } else {
    label = "Inactivo";
  }

  const category = categorize(isIdle);
  const now = Date.now();

  if (!currentSegment) {
    currentSegment = { label, category, startedAt: now };
  } else if (currentSegment.label !== label) {
    flush(now);
    currentSegment = { label, category, startedAt: now };
  } else if (now - currentSegment.startedAt >= FORCE_FLUSH_MS) {
    flush(now);
    currentSegment = { label, category, startedAt: now };
  }

  if (onStatusChange) {
    onStatusChange({ status: isIdle ? "inactivo" : "activo", app: label });
  }
}

function start({ idleThresholdMinutes, flushCallback, statusCallback }) {
  idleThresholdSeconds = Math.max(30, (idleThresholdMinutes || 5) * 60);
  onFlush = flushCallback || null;
  onStatusChange = statusCallback || null;

  stop(); // clear any previous loop first
  currentSegment = null;
  tick();
  pollInterval = setInterval(tick, POLL_MS);
}

function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (currentSegment) {
    flush(Date.now());
    currentSegment = null;
  }
}

function updateSettings({ idleThresholdMinutes }) {
  if (idleThresholdMinutes != null) idleThresholdSeconds = Math.max(30, idleThresholdMinutes * 60);
}

function isRunning() {
  return pollInterval !== null;
}

module.exports = { start, stop, updateSettings, isRunning };
