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

// El título de la ventana SIEMPRE está disponible (a diferencia de la URL real, que necesita
// la extensión del navegador) — pero trae basura variable (nombre del chat, de la reunión,
// del documento). En vez de guardar el título completo (lo que infla el catálogo sin control),
// lo comparamos contra una lista de sitios conocidos y solo usamos el nombre limpio si
// reconocemos alguno — si no reconoce nada, cae al nombre del navegador solo, como siempre.
const TITLE_SITE_PATTERNS = [
  { match: /microsoft teams/i, name: "Microsoft Teams", hostname: "teams.microsoft.com" },
  { match: /taxicaller|central de despacho/i, name: "Taxi caller", hostname: "app.taxicaller.net" },
  { match: /youtube/i, name: "Youtube", hostname: "www.youtube.com" },
  { match: /power automate/i, name: "Microsoft Power Automate", hostname: "make.powerautomate.com" },
  { match: /outlook/i, name: "Outlook", hostname: "outlook.office.com" },
  { match: /gmail/i, name: "Gmail", hostname: "mail.google.com" },
  { match: /google drive/i, name: "Google Drive", hostname: "drive.google.com" },
  { match: /google docs/i, name: "Google Docs", hostname: "docs.google.com" },
  { match: /whatsapp/i, name: "WhatsApp", hostname: "web.whatsapp.com" },
  { match: /instagram/i, name: "Instagram", hostname: "www.instagram.com" },
  { match: /facebook/i, name: "Facebook", hostname: "www.facebook.com" },
  { match: /ringcentral/i, name: "RingCentral", hostname: "app.ringcentral.com" },
  { match: /github/i, name: "GitHub", hostname: "github.com" },
  { match: /salesforce/i, name: "Salesforce", hostname: "salesforce.com" },
  { match: /zendesk/i, name: "Zendesk", hostname: "zendesk.com" },
  { match: /sharepoint/i, name: "SharePoint", hostname: "sharepoint.com" },
  { match: /supabase/i, name: "Supabase", hostname: "supabase.com" },
  { match: /notion/i, name: "Notion", hostname: "notion.so" },
  { match: /slack/i, name: "Slack", hostname: "slack.com" },
  { match: /canva/i, name: "Canva", hostname: "canva.com" },
  { match: /zoom/i, name: "Zoom", hostname: "zoom.us" },
  { match: /claude/i, name: "Claude", hostname: "claude.ai" },
];

function matchKnownSite(title) {
  if (!title) return null;
  for (const p of TITLE_SITE_PATTERNS) {
    if (p.match.test(title)) return p;
  }
  return null;
}

// "Browser - Nombre del sitio - https://hostname-conocido" — usa el dominio conocido del sitio
// (no necesariamente la página exacta en la que estaba), así el panel puede mostrar el favicon
// real con el mismo mecanismo que ya usa para los sitios detectados por URL.
function browserTitleLabel(browserName, siteName, hostname) {
  return `${browserName} - ${siteName} - https://${hostname}`;
}

// "Browser - Nombre del sitio - https://hostname" — la URL real completa, para cuando SÍ hay
// una extensión de navegador instalada y reportando el hostname de verdad (opcional, no
// requerido). El root URL únicamente (no path, no query string), así toda visita al mismo
// sitio da siempre la misma etiqueta.
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
        const tab = getCurrentBrowserTab(); // extensión del navegador, si está instalada — da la URL real
        if (tab) {
          label = browserActivityLabel(win.app, tab.hostname);
        } else {
          const knownSite = matchKnownSite(win.title);
          label = knownSite ? browserTitleLabel(win.app, knownSite.name, knownSite.hostname) : win.app;
        }
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
