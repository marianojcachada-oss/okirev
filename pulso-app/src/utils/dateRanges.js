// All dates are plain "YYYY-MM-DD" strings (no time component), matching Postgres' date
// type and the backend's todayDateStr(). Arithmetic is done on UTC-midnight Date objects
// to avoid local-timezone drift when adding/subtracting days or months.

export function atlantaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function toDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

function addMonths(dateStr, months) {
  const d = toDate(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return fmt(d);
}

function startOfWeekMonday(dateStr) {
  const d = toDate(dateStr);
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return fmt(d);
}

function startOfMonth(dateStr) {
  const d = toDate(dateStr);
  d.setUTCDate(1);
  return fmt(d);
}

function startOfYear(dateStr) {
  const d = toDate(dateStr);
  return `${d.getUTCFullYear()}-01-01`;
}

export const DATE_PRESETS = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "esta-semana", label: "Esta semana" },
  { id: "ultimos-7", label: "Últimos 7 días" },
  { id: "semana-pasada", label: "Semana pasada" },
  { id: "este-mes", label: "Este mes" },
  { id: "mes-pasado", label: "Mes pasado" },
  { id: "ultimos-3-meses", label: "Últimos 3 meses" },
  { id: "ultimos-6-meses", label: "Últimos 6 meses" },
  { id: "todo-el-anio", label: "Todo el año" },
];

export function computeRange(presetId) {
  const today = atlantaToday();
  switch (presetId) {
    case "hoy":
      return { from: today, to: today };
    case "ayer": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "esta-semana":
      return { from: startOfWeekMonday(today), to: today };
    case "ultimos-7":
      return { from: addDays(today, -6), to: today };
    case "semana-pasada": {
      const thisMonday = startOfWeekMonday(today);
      return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
    }
    case "este-mes":
      return { from: startOfMonth(today), to: today };
    case "mes-pasado": {
      const firstOfThisMonth = startOfMonth(today);
      const lastMonthEnd = addDays(firstOfThisMonth, -1);
      return { from: startOfMonth(lastMonthEnd), to: lastMonthEnd };
    }
    case "ultimos-3-meses":
      return { from: addMonths(today, -3), to: today };
    case "ultimos-6-meses":
      return { from: addMonths(today, -6), to: today };
    case "todo-el-anio":
      return { from: startOfYear(today), to: today };
    default:
      return { from: today, to: today };
  }
}
