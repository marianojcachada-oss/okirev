import { Router } from "express";
import { query, newId, nowHM, minutesSinceMidnight, todayDateStr, hoursLabelFromDates, atlantaToUtc } from "../db.js";
import { requireDeviceToken } from "../middleware/deviceAuth.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

const SHIFT_START_MINUTES = 9 * 60; // 09:00, used only to estimate "tardanza" on the first block of the day

function mapRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    name: row.name,
    team: row.team,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    checkIn: row.check_in,
    checkInAt: row.check_in_at ? new Date(row.check_in_at).toISOString() : null,
    checkOut: row.check_out,
    checkOutAt: row.check_out_at ? new Date(row.check_out_at).toISOString() : null,
    hours: hoursLabelFromDates(new Date(row.check_in_at), row.check_out_at ? new Date(row.check_out_at) : new Date()),
    late: row.late,
  };
}

// GET /api/attendance?employeeId=&date=&from=&to=  (dashboard only)
router.get("/", requireSession, requirePermission("asistencia"), async (req, res) => {
  const { employeeId, date, from, to } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (employeeId) { conditions.push(`employee_id = $${i++}`); values.push(employeeId); }
  const rangeFrom = from || date;
  const rangeTo = to || date;
  if (rangeFrom && rangeTo) { conditions.push(`date between $${i++} and $${i++}`); values.push(rangeFrom, rangeTo); }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await query(`select * from attendance ${where} order by date desc, check_in_at desc`, values);
  res.json(rows.map(mapRow));
});

// GET /api/attendance/today -- all employees' blocks for today (dashboard only, Empleados page)
router.get("/today", requireSession, requirePermission("empleados"), async (req, res) => {
  const today = todayDateStr();
  const { rows } = await query("select * from attendance where date = $1 order by check_in_at", [today]);
  res.json(rows.map(mapRow));
});

// GET /api/attendance/today/:employeeId -- convenience for the desktop tracker app
router.get("/today/:employeeId", async (req, res) => {
  const today = todayDateStr();
  const { rows } = await query(
    "select * from attendance where employee_id = $1 and date = $2 order by check_in_at",
    [req.params.employeeId, today]
  );
  res.json(rows.map(mapRow));
});

// POST /api/attendance/checkin  { employeeId }  -- código 1015. Siempre crea un bloque nuevo.
router.post("/checkin", requireDeviceToken, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: "Falta employeeId" });

  const employeeResult = await query("select id, name, team_id from employees where id = $1", [employeeId]);
  const employee = employeeResult.rows[0];
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado" });

  const openResult = await query(
    "select check_in from attendance where employee_id = $1 and check_out_at is null limit 1",
    [employeeId]
  );
  if (openResult.rows[0]) {
    return res.status(409).json({
      error: `Ya hay un check-in abierto desde las ${openResult.rows[0].check_in}. Registrá el check-out (1025) antes de uno nuevo.`,
    });
  }

  const today = todayDateStr();
  const time = nowHM();

  const todayCountResult = await query(
    "select count(*)::int as count from attendance where employee_id = $1 and date = $2",
    [employeeId, today]
  );
  const isFirstOfDay = todayCountResult.rows[0].count === 0;
  const late = isFirstOfDay ? Math.max(0, minutesSinceMidnight() - SHIFT_START_MINUTES) : 0;

  const teamNameResult = await query("select name from teams where id = $1", [employee.team_id]);
  const teamName = teamNameResult.rows[0]?.name || null;

  const id = newId("at");
  const { rows } = await query(
    `insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, late)
     values ($1, $2, $3, $4, $5, $6, now(), $7) returning *`,
    [id, employeeId, employee.name, teamName, today, time, late]
  );

  await query("update employees set status = 'activo', check_in = $1 where id = $2", [time, employeeId]);

  res.status(201).json(mapRow(rows[0]));
});

// POST /api/attendance/checkout  { employeeId }  -- código 1025. Cierra el bloque abierto más reciente.
router.post("/checkout", requireDeviceToken, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: "Falta employeeId" });

  const employeeResult = await query("select id from employees where id = $1", [employeeId]);
  if (!employeeResult.rows[0]) return res.status(404).json({ error: "Empleado no encontrado" });

  const openResult = await query(
    "select id from attendance where employee_id = $1 and check_out_at is null order by check_in_at desc limit 1",
    [employeeId]
  );
  if (!openResult.rows[0]) {
    return res.status(400).json({ error: "No hay un check-in abierto (código 1015) para cerrar" });
  }

  const time = nowHM();
  const { rows } = await query(
    "update attendance set check_out = $1, check_out_at = now() where id = $2 returning *",
    [time, openResult.rows[0].id]
  );

  await query("update employees set status = 'ausente', app = 'Sin trackear (fuera de turno)' where id = $1", [employeeId]);

  res.json(mapRow(rows[0]));
});

// POST /api/attendance/manual  { employeeId, date, checkIn, checkOut }
// Lets an administrator backfill a COMPLETE block (both ends) for a shift the employee
// forgot to clock with the tracker — unlike /checkin and /checkout above (which always use
// "right now" and are meant for the tracker itself), this takes an arbitrary date and times.
// Restricted to "ajustes" — by default only the Administrador role has that permission.
router.post("/manual", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { employeeId, date, checkIn, checkOut } = req.body;
  if (!employeeId || !date || !checkIn || !checkOut) {
    return res.status(400).json({ error: "Faltan campos: employeeId, date, checkIn, checkOut" });
  }

  const employeeResult = await query(
    "select e.*, t.name as team_name from employees e left join teams t on t.id = e.team_id where e.id = $1",
    [employeeId]
  );
  const employee = employeeResult.rows[0];
  if (!employee) return res.status(404).json({ error: "Empleado no encontrado" });

  const checkInAt = atlantaToUtc(date, checkIn);
  const checkOutAt = atlantaToUtc(date, checkOut);
  if (checkOutAt <= checkInAt) {
    return res.status(400).json({ error: "El check-out tiene que ser después del check-in, dentro del mismo día" });
  }

  const id = newId("at");
  const { rows } = await query(
    `insert into attendance (id, employee_id, name, team, date, check_in, check_in_at, check_out, check_out_at, late)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0) returning *`,
    [id, employeeId, employee.name, employee.team_name, date, checkIn, checkInAt.toISOString(), checkOut, checkOutAt.toISOString()]
  );
  res.status(201).json(mapRow(rows[0]));
});

export default router;
