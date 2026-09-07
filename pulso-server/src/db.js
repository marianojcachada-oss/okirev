import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️  No se encontró DATABASE_URL. Copiá .env.example a .env y completá la cadena de conexión de Supabase."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

export function query(text, params) {
  return pool.query(text, params);
}

// Generates a short, collision-safe id like "a1725660000123" for new rows.
// (IDs are opaque to the frontend, so this is simpler than reproducing a
// sequential counter per table.)
export function newId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// --- Time helpers (Atlanta / US Eastern, matching the dashboard's clock) ---

const TIME_ZONE = "America/New_York";

export function nowHM(date = new Date()) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
}

export function nowHMS(date = new Date()) {
  return date.toLocaleTimeString("en-US", { hour12: false, timeZone: TIME_ZONE });
}

export function minutesSinceMidnight(date = new Date()) {
  const hm = nowHM(date); // "HH:MM" in Atlanta time
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function todayDateStr(date = new Date()) {
  // en-CA locale formats as YYYY-MM-DD, which matches Postgres' date type.
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

// Converts a wall-clock date+time as read in Atlanta ("2026-09-07", "14:30") into the
// correct absolute UTC instant, correctly handling EST/EDT — used by manual attendance
// entry, where an admin types a date and time and we need the real instant it refers to.
export function atlantaToUtc(dateStr, timeStr) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00.000Z`);
  const atlantaStr = naiveUtc.toLocaleString("en-US", {
    timeZone: TIME_ZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const [datePart, timePart] = atlantaStr.split(", ");
  const [m, d, y] = datePart.split("/");
  const asIfUtc = new Date(`${y}-${m}-${d}T${timePart}.000Z`);
  const offsetMs = naiveUtc.getTime() - asIfUtc.getTime();
  return new Date(naiveUtc.getTime() + offsetMs);
}

export function formatDurationSeconds(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

// Parses "1h 05m" / "5m 20s" (what the tracker sends) back into seconds.
export function parseDurationToSeconds(label) {
  if (!label) return 0;
  const hMatch = label.match(/(\d+)\s*h/);
  const mMatch = label.match(/(\d+)\s*m/);
  const sMatch = label.match(/(\d+)\s*s/);
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  const s = sMatch ? parseInt(sMatch[1], 10) : 0;
  return h * 3600 + m * 60 + s;
}

export function hoursLabelFromDates(startDate, endDate) {
  const mins = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// Resolves an activity's category LIVE against the app catalog instead of trusting the value
// stored at insert time, so reclassifying an app retroactively updates every report/screen
// that reads activities (Actividades, Empleados, Informes). Requires the query to alias the
// activities table as "a" and left-join app_catalog as "ac" (ac.app_label = a.app).
// "Inactivo" is never app-based — it's the tracker's own idle marker — so it's excluded.
export const EFFECTIVE_CATEGORY_SQL = `
  case
    when a.category = 'Inactivo' then 'Inactivo'
    when ac.category is not null and ac.category != 'sin_clasificar' then ac.category
    else coalesce(a.category, 'Neutral')
  end
`;
