const { powerMonitor } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getCurrentBrowserTab } = require("./browserBridge");

const execFileAsync = promisify(execFile);

const BROWSER_PROCESSES = ["chrome", "msedge", "firefox", "brave", "opera"];

// Friendly names for the sites this dispatch team uses most — shown instead of the raw
// hostname. Anything not listed here falls back to a title-cased guess from the hostname.
const SITE_NAMES = {
  "teams.cloud.microsoft": "Microsoft Teams",
  "teams.microsoft.com": "Microsoft Teams",
  "www.youtube.com": "Youtube",
  "youtube.com": "Youtube",
  "make.powerautomate.com": "Microsoft Power Automate",
  "app.taxicaller.net": "Taxi caller",
  "outlook.office.com": "Outlook",
  "outlook.live.com": "Outlook",
  "mail.google.com": "Gmail",
  "drive.google.com": "Google Drive",
  "docs.google.com": "Google Docs",
  "web.whatsapp.com": "WhatsApp",
  "www.instagram.com": "Instagram",
  "www.facebook.com": "Facebook",
  "app.ringcentral.com": "RingCentral",
};

function friendlySiteName(hostname) {
  if (SITE_NAMES[hostname]) return SITE_NAMES[hostname];
  const mainLabel = hostname.replace(/^www\./, "").split(".")[0];
  return mainLabel.charAt(0).toUpperCase() + mainLabel.slice(1);
}

// El texto que se lee de la barra de direcciones a veces no trae el "https://" adelante (los
// navegadores lo esconden visualmente) — lo agregamos si falta antes de parsearlo como URL real.
function extractHostname(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// "Browser - Nombre del sitio - https://hostname" — the root URL only (no path, no query
// string), so every visit to the same site produces the exact same label. Using the full URL
// with paths/params here would blow up the app catalog into one entry per unique page visited.
function browserActivityLabel(browserName, hostname) {
  return `${browserName} - ${friendlySiteName(hostname)} - https://${hostname}`;
}

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

$url = ""
$dbg = ""
if ($name -match "chrome|msedge|opera|brave|firefox") {
  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    if ($root -eq $null) {
      $dbg = "sin-root"
    } else {
      $editCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
      $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
      $dbg = "edits=$($edits.Count)"
      $found = $null
      # Primero: por el nombre de clase interno de Chromium para el omnibox — estable sin importar el idioma de la interfaz
      foreach ($el in $edits) {
        if ($el.Current.ClassName -match "Omnibox") { $found = $el; break }
      }
      # Firefox no usa esa clase — su barra de direcciones tiene el id interno "urlbar-input", tambien estable sin importar el idioma
      if ($found -eq $null) {
        foreach ($el in $edits) {
          if ($el.Current.AutomationId -match "urlbar") { $found = $el; break }
        }
      }
      # Si ninguna de las dos aparece: por el texto visible en varios idiomas, por si el navegador no usa ninguna de esas dos
      if ($found -eq $null) {
        foreach ($el in $edits) {
          if ($el.Current.Name -match "address|direcci|búsqueda|busqueda|search|omnibox|urlbar") { $found = $el; break }
        }
      }
      if ($found -ne $null) {
        $dbg += "|clase=$($found.Current.ClassName)|id=$($found.Current.AutomationId)|nombre=$($found.Current.Name)"
        try {
          $pattern = $found.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
          $url = $pattern.Current.Value
        } catch { $dbg += "|sin-valuepattern" }
      } else {
        $dbg += "|sin-coincidencia"
      }
    }
  } catch {
    $dbg = "excepcion:$($_.Exception.Message)"
  }
  try {
    $logPath = Join-Path $env:TEMP "oklrev-uia-debug.txt"
    "$(Get-Date -Format o) | proceso=$name | url=$url | $dbg" | Out-File -FilePath $logPath -Encoding utf8 -Force
  } catch {}
}

Write-Output "$name|$url|$($sb.ToString())"
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
    return { app: "No soportado en esta plataforma", title: "", uiaUrl: "" };
  }
  try {
    const script = ensureScriptFile();
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
      { timeout: 5000, windowsHide: true, encoding: "utf8" }
    );
    const [procName, uiaUrl, ...titleParts] = stdout.trim().split("|");
    return { app: procName || "Desconocido", uiaUrl: (uiaUrl || "").trim(), title: titleParts.join("|").trim() };
  } catch (err) {
    console.error("getForegroundWindow falló:", err.message);
    return { app: "Desconocido", title: "", uiaUrl: "" };
  }
}

let pollInterval = null;
let currentSegment = null; // { label, category, startedAt }
let idleThresholdSeconds = 300;
let onFlush = null; // (record) => void
let onStatusChange = null; // ({status, app}) => void

// Window titles carry a lot of dynamic, per-moment noise (chat counts, document names,
// email subjects, meeting names) that would otherwise blow up the app catalog into one
// distinct "app" per unique title ever seen. So the label kept for classification purposes
// is deliberately coarse: just the program name for regular apps, and for browsers, just the
// site (from the extension's real hostname) or the browser name alone as a fallback — never
// the raw window title.
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
        const hostname = extractHostname(win.uiaUrl) || getCurrentBrowserTab()?.hostname || null;
        label = hostname ? browserActivityLabel(win.app, hostname) : win.app;
      } else {
        label = win.app;
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
