import { Router } from "express";
import bcrypt from "bcryptjs";
import { query, newId, todayDateStr, nowHM, EFFECTIVE_CATEGORY_SQL } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    team: row.team_name,
    teamId: row.team_id,
    role: row.role, // job title (free text), e.g. "Agente senior"
    status: row.status,
    productivity: row.productivity,
    hoursToday: Number(row.hours_today),
    checkIn: row.check_in,
    app: row.app,
    username: row.username,
    email: row.email,
    hasPassword: !!row.password_hash,
    roleId: row.role_id, // dashboard access role, e.g. "Administrador"
    roleName: row.role_name || null,
    trackingConfigId: row.tracking_config_id,
    trackingConfigName: row.tracking_config_name || null,
    idleThresholdMinutesOverride: row.idle_threshold_minutes_override,
    breakMinutesOverride: row.break_minutes_override,
  };
}

const SELECT_BASE = `
  select e.*, t.name as team_name, r.name as role_name, tc.name as tracking_config_name
  from employees e
  left join teams t on t.id = e.team_id
  left join roles r on r.id = e.role_id
  left join tracking_configs tc on tc.id = e.tracking_config_id
`;

// GET /api/employees
router.get("/", requireSession, requirePermission("empleados", "asistencia", "actividades", "equipos", "tiempo-real"), async (req, res) => {
  const { rows } = await query(`${SELECT_BASE} order by e.name`);
  res.json(rows.map(mapRow));
});

// POST /api/employees  { name, teamId, role, username, email, roleId }
// Creates the employee record. No password is set here — use POST /:id/password.
router.post("/", requireSession, requirePermission("empleados"), async (req, res) => {
  const { name, teamId, role, username, email, roleId } = req.body;
  if (!name || !username) {
    return res.status(400).json({ error: "Faltan campos: name y username son obligatorios" });
  }

  const id = newId("e");
  try {
    await query(
      `insert into employees (id, name, team_id, role, username, email, role_id, status, productivity, hours_today)
       values ($1, $2, $3, $4, $5, $6, $7, 'ausente', 0, 0)`,
      [id, name, teamId || null, role || null, username, email || null, roleId || null]
    );
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ese nombre de usuario ya existe" });
    throw err;
  }

  const result = await query(`${SELECT_BASE} where e.id = $1`, [id]);
  res.status(201).json(mapRow(result.rows[0]));
});

// GET /api/employees/:id/daily-summary?from=&to=
// Same breakdown as /summary, but for ONE employee grouped by day instead of collapsed
// into a single range total — used by Actividades when drilling into one operator.
router.get("/:id/daily-summary", requireSession, requirePermission("empleados", "asistencia", "actividades"), async (req, res) => {
  const today = todayDateStr();
  const from = req.query.from || today;
  const to = req.query.to || today;
  const perms = req.session.role?.permissions || [];
  const isScoped = perms.includes("actividades:own") && !perms.includes("actividades");
  if (isScoped && req.params.id !== req.session.employeeId) {
    return res.status(403).json({ error: "Tu rol no tiene permiso para ver la actividad de otros empleados" });
  }

  const [attendanceResult, activityResult] = await Promise.all([
    query(
      `select date,
              coalesce(sum(extract(epoch from (coalesce(check_out_at, now()) - check_in_at))), 0)::int as worked_seconds,
              count(*)::int as blocks
       from attendance
       where employee_id = $1 and date between $2 and $3
       group by date`,
      [req.params.id, from, to]
    ),
    query(
      `select (a.occurred_at at time zone 'America/New_York')::date as day,
              ${EFFECTIVE_CATEGORY_SQL} as category, sum(a.duration_seconds)::int as seconds
       from activities a
       left join app_catalog ac on ac.app_label = a.app
       where a.employee_id = $1 and (a.occurred_at at time zone 'America/New_York')::date between $2 and $3
       group by day, ${EFFECTIVE_CATEGORY_SQL}`,
      [req.params.id, from, to]
    ),
  ]);

  const byDay = {};
  const bucket = (d) =>
    byDay[d] ||
    (byDay[d] = { workedSeconds: 0, blocks: 0, productiveSeconds: 0, neutralSeconds: 0, unproductiveSeconds: 0, inactiveSeconds: 0, breakSeconds: 0 });

  for (const row of attendanceResult.rows) {
    const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date;
    const b = bucket(dateStr);
    b.workedSeconds = row.worked_seconds;
    b.blocks = row.blocks;
  }
  for (const row of activityResult.rows) {
    const dateStr = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day;
    const b = bucket(dateStr);
    const seconds = Number(row.seconds);
    if (row.category === "Productiva") b.productiveSeconds += seconds;
    else if (row.category === "Improductiva") b.unproductiveSeconds += seconds;
    else if (row.category === "Inactivo") b.inactiveSeconds += seconds;
    else if (row.category === "Break") b.breakSeconds += seconds;
    else b.neutralSeconds += seconds;
  }

  const result = Object.entries(byDay)
    .map(([date, s]) => ({
      date,
      workedSeconds: s.workedSeconds,
      productiveSeconds: s.productiveSeconds,
      neutralSeconds: s.neutralSeconds,
      unproductiveSeconds: s.unproductiveSeconds,
      inactiveSeconds: s.inactiveSeconds,
      breakSeconds: s.breakSeconds,
      activitySeconds: s.productiveSeconds + s.neutralSeconds + s.unproductiveSeconds + s.inactiveSeconds + s.breakSeconds,
      blocks: s.blocks,
      productivity: s.workedSeconds > 0 ? Math.round((s.productiveSeconds / s.workedSeconds) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(result);
});

// GET /api/employees/devices -- every employee's known computers (hostname seen at login),
// most-recently-used first. Fetched once and grouped client-side by Empleados, instead of
// one request per row.
router.get("/devices", requireSession, requirePermission("empleados"), async (req, res) => {
  const { rows } = await query(
    `select employee_id, hostname, first_seen_at, last_seen_at
     from employee_devices
     order by last_seen_at desc`
  );
  res.json(
    rows.map((r) => ({
      employeeId: r.employee_id,
      hostname: r.hostname,
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    }))
  );
});

// GET /api/employees/summary?date=YYYY-MM-DD | ?from=&to=  (default: today in Atlanta time)
// Per-employee breakdown: worked hours (from attendance), and productive/neutral/
// unproductive/inactive hours (from activities). Used by Empleados and Asistencia.
router.get("/summary", requireSession, requirePermission("empleados", "asistencia", "actividades"), async (req, res) => {
  const today = todayDateStr();
  const from = req.query.from || req.query.date || today;
  const to = req.query.to || req.query.date || today;
  const perms = req.session.role?.permissions || [];
  const scopedEmployeeId = perms.includes("actividades:own") && !perms.includes("actividades") ? req.session.employeeId : null;

  const [attendanceResult, activityResult] = await Promise.all([
    query(
      `select employee_id,
              coalesce(sum(extract(epoch from (coalesce(check_out_at, now()) - check_in_at))), 0)::int as worked_seconds,
              count(*)::int as blocks,
              coalesce(sum(late), 0)::int as late_minutes
       from attendance
       where date between $1 and $2
         and ($3::text is null or employee_id = $3)
       group by employee_id`,
      [from, to, scopedEmployeeId]
    ),
    query(
      `select a.employee_id, ${EFFECTIVE_CATEGORY_SQL} as category, sum(a.duration_seconds)::int as seconds
       from activities a
       left join app_catalog ac on ac.app_label = a.app
       where (a.occurred_at at time zone 'America/New_York')::date between $1 and $2
         and ($3::text is null or a.employee_id = $3)
       group by a.employee_id, ${EFFECTIVE_CATEGORY_SQL}`,
      [from, to, scopedEmployeeId]
    ),
  ]);

  const byEmployee = {};
  const bucket = (id) =>
    byEmployee[id] ||
    (byEmployee[id] = { workedSeconds: 0, blocks: 0, lateMinutes: 0, productiveSeconds: 0, neutralSeconds: 0, unproductiveSeconds: 0, inactiveSeconds: 0, breakSeconds: 0 });

  for (const row of attendanceResult.rows) {
    const b = bucket(row.employee_id);
    b.workedSeconds = row.worked_seconds;
    b.blocks = row.blocks;
    b.lateMinutes = row.late_minutes;
  }
  for (const row of activityResult.rows) {
    const b = bucket(row.employee_id);
    const seconds = Number(row.seconds);
    if (row.category === "Productiva") b.productiveSeconds += seconds;
    else if (row.category === "Improductiva") b.unproductiveSeconds += seconds;
    else if (row.category === "Inactivo") b.inactiveSeconds += seconds;
    else if (row.category === "Break") b.breakSeconds += seconds;
    else b.neutralSeconds += seconds; // "Neutral" y cualquier categoría vieja/no reconocida cuentan como neutral
  }

  const toHours = (s) => Math.round((s / 3600) * 10) / 10;

  const result = Object.entries(byEmployee).map(([employeeId, s]) => ({
    employeeId,
    workedHours: toHours(s.workedSeconds),
    neutralHours: toHours(s.neutralSeconds),
    unproductiveHours: toHours(s.unproductiveSeconds),
    inactiveHours: toHours(s.inactiveSeconds),
    breakHours: toHours(s.breakSeconds),
    // Raw seconds, for displays that need exact "Xh Ym" precision instead of rounded decimals.
    workedSeconds: s.workedSeconds,
    productiveSeconds: s.productiveSeconds,
    neutralSeconds: s.neutralSeconds,
    unproductiveSeconds: s.unproductiveSeconds,
    inactiveSeconds: s.inactiveSeconds,
    breakSeconds: s.breakSeconds,
    activitySeconds: s.productiveSeconds + s.neutralSeconds + s.unproductiveSeconds + s.inactiveSeconds + s.breakSeconds,
    blocks: s.blocks,
    lateMinutes: s.lateMinutes,
    productivity: s.workedSeconds > 0 ? Math.round((s.productiveSeconds / s.workedSeconds) * 100) : 0,
  }));

  res.json(result);
});

// GET /api/employees/:id
router.get("/:id", requireSession, requirePermission("empleados"), async (req, res) => {
  const { rows } = await query(`${SELECT_BASE} where e.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });
  res.json(mapRow(rows[0]));
});

// PATCH /api/employees/:id
// Used to update live tracking state: status, app, productivity, hoursToday.
// This is the shape of update the desktop tracker sends periodically — NOT gated by session
// (the tracker authenticates via the device token on the routes that need it, not a dashboard
// login), so it keeps working exactly as before.
router.patch("/:id", async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;

  if ("status" in req.body) { fields.push(`status = $${i++}`); values.push(req.body.status); }
  if ("app" in req.body) { fields.push(`app = $${i++}`); values.push(req.body.app); }
  if ("productivity" in req.body) { fields.push(`productivity = $${i++}`); values.push(req.body.productivity); }
  if ("hoursToday" in req.body) { fields.push(`hours_today = $${i++}`); values.push(req.body.hoursToday); }

  if (fields.length === 0) return res.status(400).json({ error: "Nada para actualizar" });

  const previousResult = await query("select status, name from employees where id = $1", [req.params.id]);
  const previous = previousResult.rows[0];
  if (!previous) return res.status(404).json({ error: "Empleado no encontrado" });

  values.push(req.params.id);
  const { rows } = await query(`update employees set ${fields.join(", ")} where id = $${i} returning id`, values);
  if (!rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });

  // Only fire once per transition into "inactivo", not on every poll while it stays that way.
  if (req.body.status === "inactivo" && previous.status !== "inactivo") {
    const thresholdResult = await query(
      `select coalesce(e.idle_threshold_minutes_override, tc.idle_threshold_minutes, s.idle_threshold_minutes, 5) as minutes
       from employees e
       left join tracking_configs tc on tc.id = e.tracking_config_id
       cross join settings s
       where e.id = $1 and s.id = 1`,
      [req.params.id]
    );
    const minutes = thresholdResult.rows[0]?.minutes || 5;
    await query(
      `insert into alerts (id, severity, type, employee_id, employee_name, detail, time, status)
       values ($1, 'advertencia', 'Inactividad prolongada', $2, $3, $4, $5, 'abierta')`,
      [
        newId("a"),
        req.params.id,
        previous.name,
        `Sin actividad de mouse ni teclado por más de ${minutes} minutos`,
        nowHM(),
      ]
    );
  }

  const result = await query(`${SELECT_BASE} where e.id = $1`, [req.params.id]);
  res.json(mapRow(result.rows[0]));
});

// PUT /api/employees/:id  { name, teamId, role, username, email, roleId }
// Admin edits to an employee's profile (not the live tracking fields — see PATCH above).
router.put("/:id", requireSession, requirePermission("empleados"), async (req, res) => {
  const { name, teamId, role, username, email, roleId, trackingConfigId, idleThresholdMinutesOverride, breakMinutesOverride } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

  if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
  if (teamId !== undefined) { fields.push(`team_id = $${i++}`); values.push(teamId || null); }
  if (role !== undefined) { fields.push(`role = $${i++}`); values.push(role); }
  if (username !== undefined) { fields.push(`username = $${i++}`); values.push(username); }
  if (email !== undefined) { fields.push(`email = $${i++}`); values.push(email); }
  if (roleId !== undefined) { fields.push(`role_id = $${i++}`); values.push(roleId || null); }
  if (trackingConfigId !== undefined) { fields.push(`tracking_config_id = $${i++}`); values.push(trackingConfigId || null); }
  if (idleThresholdMinutesOverride !== undefined) {
    fields.push(`idle_threshold_minutes_override = $${i++}`);
    values.push(idleThresholdMinutesOverride === "" || idleThresholdMinutesOverride === null ? null : Number(idleThresholdMinutesOverride));
  }
  if (breakMinutesOverride !== undefined) {
    fields.push(`break_minutes_override = $${i++}`);
    values.push(breakMinutesOverride === "" || breakMinutesOverride === null ? null : Number(breakMinutesOverride));
  }

  if (fields.length === 0) return res.status(400).json({ error: "Nada para actualizar" });

  values.push(req.params.id);
  try {
    const { rows } = await query(`update employees set ${fields.join(", ")} where id = $${i} returning id`, values);
    if (!rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ese nombre de usuario ya existe" });
    throw err;
  }

  const result = await query(`${SELECT_BASE} where e.id = $1`, [req.params.id]);
  res.json(mapRow(result.rows[0]));
});

// DELETE /api/employees/:id
router.delete("/:id", requireSession, requirePermission("empleados"), async (req, res) => {
  const { rows } = await query("delete from employees where id = $1 returning id", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });
  res.json({ deleted: true });
});

// POST /api/employees/:id/password  { password }
// Only an administrator can call this (from Empleados). There is no self-service reset.
router.post("/:id/password", requireSession, requirePermission("empleados"), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query("update employees set password_hash = $1 where id = $2 returning id", [hash, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });
  res.json({ ok: true });
});

export default router;
