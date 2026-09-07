import { Router } from "express";
import { query, newId, formatDurationSeconds, parseDurationToSeconds, EFFECTIVE_CATEGORY_SQL } from "../db.js";
import { requireDeviceToken } from "../middleware/deviceAuth.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

// True if this session's role can only see its own activity (not everyone's).
function isOwnScoped(req) {
  const perms = req.session.role?.permissions || [];
  return perms.includes("actividades:own") && !perms.includes("actividades");
}

function mapRow(row) {
  return {
    id: row.id,
    time: new Date(row.occurred_at).toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }),
    occurredAt: new Date(row.occurred_at).toISOString(),
    employeeId: row.employee_id,
    employee: row.employee_name,
    app: row.app,
    category: row.effective_category,
    duration: formatDurationSeconds(row.duration_seconds),
    durationSeconds: row.duration_seconds,
  };
}

function minutesSinceMidnightAtlanta(date) {
  const hm = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// GET /api/activities?date=YYYY-MM-DD (optional; default: latest 200 regardless of date)
// If the session's role is scoped to "actividades:own", results are forced to that
// employee's own activity regardless of anything the client asks for.
router.get("/", requireSession, requirePermission("actividades"), async (req, res) => {
  const { date, from, to, employeeId } = req.query;
  const scopedEmployeeId = isOwnScoped(req) ? req.session.employeeId : employeeId || null;

  const conditions = [];
  const values = [];
  let i = 1;
  if (date) {
    conditions.push(`(a.occurred_at at time zone 'America/New_York')::date = $${i++}`);
    values.push(date);
  } else if (from && to) {
    conditions.push(`(a.occurred_at at time zone 'America/New_York')::date between $${i++} and $${i++}`);
    values.push(from, to);
  }
  if (scopedEmployeeId) { conditions.push(`a.employee_id = $${i++}`); values.push(scopedEmployeeId); }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const limit = date || (from && to) ? "" : "limit 200";
  const { rows } = await query(
    `select a.*, ${EFFECTIVE_CATEGORY_SQL} as effective_category
     from activities a
     left join app_catalog ac on ac.app_label = a.app
     ${where}
     order by a.occurred_at desc ${limit}`,
    values
  );
  res.json(rows.map(mapRow));
});

// GET /api/activities/timeline?date=YYYY-MM-DD -- per-employee segments for the 24h chart.
// Each segment's start is derived from occurred_at (the end of the segment) minus its duration.
// Scoped roles (actividades:own) only ever get their own employee_id back, server-enforced.
router.get("/timeline", requireSession, requirePermission("actividades"), async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: "Falta el parámetro date (YYYY-MM-DD)" });
  const scopedEmployeeId = isOwnScoped(req) ? req.session.employeeId : null;

  const { rows } = await query(
    `select a.employee_id, e.name as employee_name, t.name as team,
            a.app, ${EFFECTIVE_CATEGORY_SQL} as category, a.duration_seconds, a.occurred_at
     from activities a
     join employees e on e.id = a.employee_id
     left join teams t on t.id = e.team_id
     left join app_catalog ac on ac.app_label = a.app
     where (a.occurred_at at time zone 'America/New_York')::date = $1
       and ($2::text is null or a.employee_id = $2)
     order by a.employee_id, a.occurred_at`,
    [date, scopedEmployeeId]
  );

  const byEmployee = {};
  for (const row of rows) {
    const endDate = new Date(row.occurred_at);
    const startDate = new Date(endDate.getTime() - row.duration_seconds * 1000);
    const startMinutes = minutesSinceMidnightAtlanta(startDate);
    let endMinutes = minutesSinceMidnightAtlanta(endDate);
    if (endMinutes < startMinutes) endMinutes = 1440; // segment straddles midnight; clip to end of day

    if (!byEmployee[row.employee_id]) {
      byEmployee[row.employee_id] = {
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        team: row.team,
        segments: [],
      };
    }
    byEmployee[row.employee_id].segments.push({ app: row.app, category: row.category, startMinutes, endMinutes });
  }

  res.json(Object.values(byEmployee));
});

// GET /api/activities/timeline-by-day?employeeId=&from=&to= -- same 24h-segment shape as
// /timeline, but one entry PER DAY for a single employee instead of one entry per employee
// for a single day. Used by Actividades when a specific operator + a multi-day range are
// both selected, so each day gets its own clock-positioned bar.
router.get("/timeline-by-day", requireSession, requirePermission("actividades"), async (req, res) => {
  const { employeeId, from, to } = req.query;
  if (!employeeId || !from || !to) {
    return res.status(400).json({ error: "Faltan parámetros: employeeId, from, to" });
  }
  if (isOwnScoped(req) && employeeId !== req.session.employeeId) {
    return res.status(403).json({ error: "Tu rol no tiene permiso para ver la actividad de otros empleados" });
  }

  const { rows } = await query(
    `select (a.occurred_at at time zone 'America/New_York')::date as day,
            a.app, ${EFFECTIVE_CATEGORY_SQL} as category, a.duration_seconds, a.occurred_at
     from activities a
     left join app_catalog ac on ac.app_label = a.app
     where a.employee_id = $1
       and (a.occurred_at at time zone 'America/New_York')::date between $2 and $3
     order by a.occurred_at`,
    [employeeId, from, to]
  );

  const byDay = {};
  for (const row of rows) {
    const dateStr = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day;
    const endDate = new Date(row.occurred_at);
    const startDate = new Date(endDate.getTime() - row.duration_seconds * 1000);
    const startMinutes = minutesSinceMidnightAtlanta(startDate);
    let endMinutes = minutesSinceMidnightAtlanta(endDate);
    if (endMinutes < startMinutes) endMinutes = 1440; // segment straddles midnight; clip to end of day

    if (!byDay[dateStr]) byDay[dateStr] = { date: dateStr, segments: [] };
    byDay[dateStr].segments.push({ app: row.app, category: row.category, startMinutes, endMinutes });
  }

  res.json(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
});

// POST /api/activities  { employeeId, app, duration, category? }
// The tracker always sends employeeId/app/duration. `category` is only sent for "Inactivo"
// (only the tracker knows about idle time) — for everything else, the category is resolved
// here from the catalog, so reclassifying an app from the dashboard takes effect immediately
// without needing to update the desktop app.
router.post("/", requireDeviceToken, async (req, res) => {
  const { employeeId, app, duration, category: providedCategory } = req.body;
  if (!employeeId || !app || !duration) {
    return res.status(400).json({ error: "Faltan campos: employeeId, app, duration" });
  }

  const employeeResult = await query("select id, name from employees where id = $1", [employeeId]);
  const employee = employeeResult.rows[0];
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado" });

  // Register the app in the catalog the first time it's seen (no-op if it's already there).
  await query("insert into app_catalog (app_label) values ($1) on conflict (app_label) do nothing", [app]);

  let category = providedCategory;
  if (!category) {
    const catalogResult = await query("select category from app_catalog where app_label = $1", [app]);
    const catalogCategory = catalogResult.rows[0]?.category;
    category = catalogCategory && catalogCategory !== "sin_clasificar" ? catalogCategory : "Neutral";
  }

  const id = newId("ac");
  const durationSeconds = parseDurationToSeconds(duration);
  const { rows } = await query(
    `insert into activities (id, employee_id, employee_name, app, category, duration_seconds)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [id, employeeId, employee.name, app, category, durationSeconds]
  );

  await query("update employees set app = $1 where id = $2", [app, employeeId]);

  res.status(201).json(mapRow(rows[0]));
});

export default router;
