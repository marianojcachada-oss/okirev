const THEMES = ["oscuro", "claro", "alto-contraste", "medianoche"];
const THEME_LABELS = { oscuro: "Oscuro", claro: "Claro", "alto-contraste": "Alto contraste", medianoche: "Medianoche" };
const THEME_STORAGE_KEY = "oklrev_tracker_theme";

const initialTheme = localStorage.getItem(THEME_STORAGE_KEY) || "oscuro";
document.documentElement.setAttribute("data-theme", initialTheme);
window.pulso.setWindowTheme(initialTheme);

function cycleTheme() {
  const current = localStorage.getItem(THEME_STORAGE_KEY) || "oscuro";
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  localStorage.setItem(THEME_STORAGE_KEY, next);
  document.documentElement.setAttribute("data-theme", next);
  window.pulso.setWindowTheme(next);
  const btn = $("theme-toggle-btn");
  if (btn) btn.title = `Tema: ${THEME_LABELS[next]} — clic para cambiar`;
}

const state = {
  config: null,
  today: [],
  settings: null,
  trackingActive: false,
  tickInterval: null,
  syncInterval: null,
  breakTickInterval: null,
  breakState: null, // { allowedSeconds, usedSeconds, isOnBreak, breakStartedAt }
  breakRang: false, // whether the "time's up" beep already played for the current break
};

function $(id) {
  return document.getElementById(id);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiGet(base, path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { headers });
  if (!res.ok) throw new Error((await safeJson(res))?.error || `Error ${res.status}`);
  return res.json();
}

async function apiPost(base, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error((await safeJson(res))?.error || `Error ${res.status}`);
  return res.json();
}

function fmtElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function fmtNowHM() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
}

/* ---------------- Setup view (login) ---------------- */

let setupListenersAttached = false;

function initSetupView() {
  const apiInput = $("setup-api-url");
  const dashboardInput = $("setup-dashboard-url");
  const usernameInput = $("setup-username");
  const passwordInput = $("setup-password");

  if (state.config?.apiUrl) apiInput.value = state.config.apiUrl;
  if (state.config?.dashboardUrl) dashboardInput.value = state.config.dashboardUrl;
  usernameInput.value = "";
  passwordInput.value = "";
  $("setup-error").textContent = "";
  setTimeout(() => usernameInput.focus(), 50);

  if (setupListenersAttached) return; // avoid stacking duplicate handlers on repeat logins
  setupListenersAttached = true;

  $("setup-advanced-toggle").addEventListener("click", () => {
    $("setup-advanced").classList.toggle("hidden");
  });

  async function doLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const apiUrl = apiInput.value.trim();

    $("setup-error").textContent = "";

    if (!apiUrl) {
      $("setup-error").textContent = "Falta la URL de la API.";
      return;
    }
    if (!username || !password) {
      $("setup-error").textContent = "Completá usuario y contraseña.";
      return;
    }

    const btn = $("setup-login-btn");
    btn.disabled = true;
    btn.textContent = "Ingresando…";
    try {
      const hostname = await window.pulso.getHostname().catch(() => null);
      const employee = await apiPost(apiUrl, "/auth/login", { username, password, hostname });
      state.config = await window.pulso.saveConfig({
        apiUrl,
        dashboardUrl: dashboardInput.value.trim(),
        employeeId: employee.id,
        employeeName: employee.name,
        sessionToken: employee.token,
      });
      showMainView();
    } catch (err) {
      $("setup-error").textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Iniciar sesión";
    }
  }

  $("setup-login-btn").addEventListener("click", doLogin);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

/* ---------------- Settings + tracking orchestration ---------------- */

async function fetchSettings() {
  try {
    const s = await apiGet(state.config.apiUrl, `/tracking-configs/resolve/${state.config.employeeId}`);
    state.settings = { idleThresholdMinutes: s.idleThresholdMinutes || 5 };
    if (state.trackingActive) {
      window.pulso.updateTrackingSettings(state.settings);
    }
  } catch {
    if (!state.settings) state.settings = { idleThresholdMinutes: 5 };
  }
}

async function ensureTracking(shouldBeActive) {
  if (shouldBeActive && !state.trackingActive) {
    if (!state.settings) await fetchSettings();
    await window.pulso.startTracking({
      apiUrl: state.config.apiUrl,
      employeeId: state.config.employeeId,
      sessionToken: state.config.sessionToken || null,
      idleThresholdMinutes: state.settings.idleThresholdMinutes,
    });
    state.trackingActive = true;
  } else if (!shouldBeActive && state.trackingActive) {
    await window.pulso.stopTracking();
    state.trackingActive = false;
    $("current-app-label").textContent = "";
  }
}

/* ---------------- Break (10-31) ---------------- */

function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch {
    // audio not available in this environment — the visual countdown alone is enough
  }
}

function fmtCountdown(totalSeconds) {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const m = String(Math.floor(abs / 60)).padStart(2, "0");
  const s = String(abs % 60).padStart(2, "0");
  return `${sign}${m}:${s}`;
}

function isCheckedIn() {
  return state.today.some((b) => b.checkOut === null);
}

function renderBreakDisplay() {
  const b = state.breakState;
  const countdownEl = $("break-countdown");
  const btn = $("break-btn");
  if (!b) {
    countdownEl.textContent = "--:--";
    btn.disabled = !isCheckedIn();
    return;
  }

  let usedNow = b.usedSeconds;
  if (b.isOnBreak && b.breakStartedAt) {
    usedNow += Math.floor((Date.now() - new Date(b.breakStartedAt).getTime()) / 1000);
  }
  const remaining = b.allowedSeconds - usedNow;

  countdownEl.textContent = fmtCountdown(remaining);
  countdownEl.classList.toggle("over", remaining < 0);

  if (remaining <= 0 && b.isOnBreak && !state.breakRang) {
    state.breakRang = true;
    playBell();
    // El break se corta solo al llegar al límite configurado (no hace falta que el operador
    // haga clic) y retoma el trackeo normal — a partir de ahí, si sigue sin hacer nada, el
    // detector de inactividad de siempre es el que se encarga de marcarlo como Inactivo.
    endBreak().catch((err) => console.error("No se pudo cerrar el break automáticamente:", err.message));
  }
  if (remaining > 0) state.breakRang = false;

  btn.classList.toggle("active", b.isOnBreak);
  btn.textContent = b.isOnBreak ? "Volver de 10-31" : "Iniciar 10-31";
  btn.disabled = !b.isOnBreak && !isCheckedIn();
}

async function refreshBreakStatus() {
  if (!state.config?.employeeId) return;
  try {
    state.breakState = await apiGet(state.config.apiUrl, `/breaks/current/${state.config.employeeId}`);
  } catch {
    state.breakState = null;
  }
  renderBreakDisplay();

  clearInterval(state.breakTickInterval);
  if (state.breakState?.isOnBreak) {
    state.breakTickInterval = setInterval(renderBreakDisplay, 1000);
  }
}

async function endBreak() {
  await apiPost(state.config.apiUrl, "/breaks/end", {}, state.config.sessionToken);
  await ensureTracking(true); // resume activity tracking now that the break is over
  await refreshBreakStatus();
}

async function handleBreakToggle() {
  const btn = $("break-btn");
  btn.disabled = true;
  try {
    if (state.breakState?.isOnBreak) {
      await endBreak();
    } else {
      await ensureTracking(false); // pause activity tracking for the duration of the break — otherwise the foreground app keeps getting logged in parallel with the break, double-counting that time
      await apiPost(state.config.apiUrl, "/breaks/start", {}, state.config.sessionToken);
      await refreshBreakStatus();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = !isCheckedIn();
  }
}

/* ---------------- Custom confirm (avoids Electron's native confirm() dialog) ---------------- */

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = $("confirm-overlay");
    $("confirm-message").textContent = message;
    overlay.classList.remove("hidden");

    function cleanup(result) {
      overlay.classList.add("hidden");
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
      resolve(result);
    }
    const yesBtn = $("confirm-yes-btn");
    const noBtn = $("confirm-no-btn");
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}

/* ---------------- Main view ---------------- */

function atlantaDateStr(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function formatDayLabel(dateStr) {
  const todayStr = atlantaDateStr(new Date());
  const yesterdayStr = atlantaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (dateStr === todayStr) return "Hoy";
  if (dateStr === yesterdayStr) return "Ayer";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d); // componentes locales, evita el corrimiento de un dia al parsear como UTC
  const label = date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtHoursMinutes(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function renderBlocks(blocks) {
  const list = $("blocks-list");
  if (!blocks.length) {
    list.innerHTML = '<div class="empty">Todavía no marcaste ningún check-in esta semana.</div>';
    return;
  }

  const byDay = new Map();
  for (const b of blocks) {
    if (!byDay.has(b.date)) byDay.set(b.date, []);
    byDay.get(b.date).push(b);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a)); // mas reciente primero

  list.innerHTML = days
    .map((day) => {
      const dayBlocks = byDay.get(day).slice().sort((a, b) => (b.checkInAt || "").localeCompare(a.checkInAt || ""));
      const totalMs = dayBlocks.reduce((sum, b) => {
        const end = b.checkOutAt ? new Date(b.checkOutAt) : new Date();
        return sum + (end - new Date(b.checkInAt));
      }, 0);
      const rows = dayBlocks
        .map((b) => {
          const isOpen = b.checkOut === null;
          return `
            <div class="block-row">
              <div class="block-col">
                <span class="block-label">Check-in (1015)</span>
                <span class="block-value">${b.checkIn}</span>
              </div>
              <div class="block-col">
                <span class="block-label">Check-out (1025)</span>
                <span class="block-value">${b.checkOut ?? "—"}</span>
              </div>
              <div class="block-duration ${isOpen ? "open" : ""}">${isOpen ? "en curso" : b.hours}</div>
            </div>
          `;
        })
        .join("");
      return `
        <div class="day-header"><span>${formatDayLabel(day)}</span><span class="day-total">${fmtHoursMinutes(totalMs)}</span></div>
        ${rows}
      `;
    })
    .join("");
}

function updateStatusFromBlocks(blocks) {
  const open = blocks.find((b) => b.checkOut === null);
  clearInterval(state.tickInterval);

  const toggleBtn = $("toggle-btn");
  if (open) {
    toggleBtn.textContent = "Finalizar jornada";
    toggleBtn.classList.add("active");
    $("status-label").textContent = "En curso";
    const startedAt = new Date(open.checkInAt).getTime();
    const tick = () => {
      $("timer").textContent = fmtElapsed(Date.now() - startedAt);
    };
    tick();
    state.tickInterval = setInterval(tick, 1000);
  } else {
    toggleBtn.textContent = "Iniciar jornada";
    toggleBtn.classList.remove("active");
    $("status-label").textContent = "Sin iniciar";
    $("timer").textContent = "00:00:00";
  }

  ensureTracking(!!open);
}

async function refreshToday(silent) {
  try {
    const blocks = await apiGet(state.config.apiUrl, `/attendance/week/${state.config.employeeId}`);
    state.today = blocks;
    try {
      renderBlocks(blocks);
    } catch (err) {
      console.error("No se pudo dibujar el historial:", err.message);
      window.pulso.logIssue("renderBlocks", `${err.message} — cantidad de bloques: ${blocks.length}`);
    }
    await fetchSettings();
    updateStatusFromBlocks(blocks);
    await refreshBreakStatus();
    $("sync-label").textContent = `Última sincronización: hoy a las ${fmtNowHM()}`;
  } catch (err) {
    if (!silent) $("sync-label").textContent = `Sin conexión (${err.message})`;
  }
}

async function handleToggle() {
  const open = state.today.find((b) => b.checkOut === null);
  const toggleBtn = $("toggle-btn");
  toggleBtn.disabled = true;
  try {
    if (open) {
      await apiPost(state.config.apiUrl, "/attendance/checkout", { employeeId: state.config.employeeId }, state.config.sessionToken);
    } else {
      await apiPost(state.config.apiUrl, "/attendance/checkin", { employeeId: state.config.employeeId }, state.config.sessionToken);
    }
    await refreshToday(false);
  } catch (err) {
    alert(err.message);
  } finally {
    toggleBtn.disabled = false;
  }
}

let mainListenersAttached = false;

function initMainView() {
  $("employee-name").textContent = state.config.employeeName || "Operador";
  const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || "oscuro";
  $("theme-toggle-btn").title = `Tema: ${THEME_LABELS[currentTheme]} — clic para cambiar`;

  if (!mainListenersAttached) {
    mainListenersAttached = true;

    $("toggle-btn").addEventListener("click", handleToggle);
    $("break-btn").addEventListener("click", handleBreakToggle);

    $("open-dashboard-btn").addEventListener("click", () => {
      const base = state.config.dashboardUrl || "http://localhost:5173";
      const url = state.config.sessionToken ? `${base}?token=${encodeURIComponent(state.config.sessionToken)}` : base;
      window.pulso.openDashboard(url);
    });

    $("tray-btn").addEventListener("click", () => {
      window.pulso.minimizeToTray();
    });

    $("compact-toggle-btn").addEventListener("click", () => {
      const isCompact = document.body.classList.toggle("compact-mode");
      window.pulso.setCompactMode(isCompact);
      $("compact-toggle-btn").title = isCompact ? "Expandir" : "Modo compacto";
    });

    $("theme-toggle-btn").addEventListener("click", cycleTheme);

    window.pulso.onTrackingUpdate(({ app: appLabel }) => {
      $("current-app-label").textContent = appLabel ? `Detectando: ${appLabel}` : "";
    });

    $("settings-btn").addEventListener("click", async () => {
      const confirmReset = await showConfirm("¿Cambiar de usuario en esta computadora?");
      if (!confirmReset) return;
      clearInterval(state.tickInterval);
      clearInterval(state.syncInterval);
      clearInterval(state.breakTickInterval);
      await ensureTracking(false);
      state.config = await window.pulso.saveConfig({});
      showSetupView();
    });
  }

  refreshToday(false);
  state.syncInterval = setInterval(() => refreshToday(true), 30000);
}

/* ---------------- View switching ---------------- */

function showSetupView() {
  $("main-view").classList.add("hidden");
  $("setup-view").classList.remove("hidden");
  initSetupView();
}

function showMainView() {
  $("setup-view").classList.add("hidden");
  $("main-view").classList.remove("hidden");
  initMainView();
}

function setupUpdateBanner() {
  const banner = $("update-banner");
  const text = $("update-banner-text");
  const btn = $("update-banner-btn");
  let hideTimeout = null;

  btn.addEventListener("click", () => {
    window.pulso.installUpdate();
  });

  $("version-label").addEventListener("click", () => {
    window.pulso.checkForUpdatesNow();
  });

  window.pulso.onUpdateStatus(({ state: updateState, version, percent }) => {
    clearTimeout(hideTimeout);
    banner.classList.remove("hidden");
    if (updateState === "checking") {
      banner.classList.remove("ready");
      text.textContent = "Buscando actualizaciones…";
      btn.classList.add("hidden");
    } else if (updateState === "downloading") {
      banner.classList.remove("ready");
      text.textContent = typeof percent === "number" ? `Descargando la versión ${version}… ${percent}%` : `Descargando la versión ${version}…`;
      btn.classList.add("hidden");
    } else if (updateState === "ready") {
      banner.classList.add("ready");
      text.textContent = `Versión ${version} lista`;
      btn.classList.remove("hidden");
    } else if (updateState === "up-to-date") {
      banner.classList.add("ready");
      text.textContent = "Ya tenés la última versión";
      btn.classList.add("hidden");
      hideTimeout = setTimeout(() => banner.classList.add("hidden"), 4000);
    } else if (updateState === "error") {
      banner.classList.remove("ready");
      text.textContent = "Hubo un problema con la actualización";
      btn.classList.add("hidden");
      hideTimeout = setTimeout(() => banner.classList.add("hidden"), 4000);
    }
  });
}

async function init() {
  state.config = await window.pulso.getConfig();
  if (!state.config?.apiUrl || !state.config?.employeeId) {
    showSetupView();
  } else {
    showMainView();
  }
  window.pulso.getVersion().then((v) => {
    const el = $("version-label");
    if (el) el.textContent = `OKlrev Tracker v${v}`;
  });
  setupUpdateBanner();
}

document.addEventListener("DOMContentLoaded", init);
