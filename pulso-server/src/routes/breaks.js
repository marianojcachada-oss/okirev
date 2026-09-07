import { Router } from "express";
import { query, newId, todayDateStr } from "../db.js";
import { requireDeviceToken } from "../middleware/deviceAuth.js";

const router = Router();

// GET /api/breaks/current/:employeeId -- NOT session-gated, the tracker calls this directly.
// Tells the tracker: how many minutes of break this employee is allowed, how many seconds
// they've already used during the CURRENT shift (attendance block), and whether a break is
// open right now. The allowance naturally resets on every new check-in because it's scoped
// to the current attendance_id, which is brand new with zero breaks logged against it.
router.get("/current/:employeeId", async (req, res) => {
  const employeeId = req.params.employeeId;

  const attResult = await query(
    "select id from attendance where employee_id = $1 and check_out_at is null order by check_in_at desc limit 1",
    [employeeId]
  );
  const attendanceId = attResult.rows[0]?.id || null;

  const configResult = await query(
    `select coalesce(e.break_minutes_override, tc.break_minutes, s.default_break_minutes, 15) as minutes
     from employees e
     left join tracking_configs tc on tc.id = e.tracking_config_id
     cross join settings s
     where e.id = $1 and s.id = 1`,
    [employeeId]
  );
  const allowedMinutes = configResult.rows[0]?.minutes || 15;

  let usedSeconds = 0;
  if (attendanceId) {
    const usedResult = await query(
      `select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at))), 0)::int as seconds
       from breaks where attendance_id = $1`,
      [attendanceId]
    );
    usedSeconds = usedResult.rows[0]?.seconds || 0;
  }

  const openResult = await query(
    "select * from breaks where employee_id = $1 and ended_at is null order by started_at desc limit 1",
    [employeeId]
  );
  const openBreak = openResult.rows[0] || null;

  res.json({
    allowedMinutes,
    allowedSeconds: allowedMinutes * 60,
    usedSeconds,
    isOnBreak: !!openBreak,
    breakStartedAt: openBreak ? new Date(openBreak.started_at).toISOString() : null,
  });
});

// POST /api/breaks/start  { employeeId }  -- código 10-31. Does NOT touch check-in/check-out;
// the shift timer keeps running exactly as before.
router.post("/start", requireDeviceToken, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: "Falta employeeId" });

  const attResult = await query(
    "select id from attendance where employee_id = $1 and check_out_at is null order by check_in_at desc limit 1",
    [employeeId]
  );
  const attendanceId = attResult.rows[0]?.id;
  if (!attendanceId) {
    return res.status(400).json({ error: "No hay una jornada iniciada (1015) — no se puede tomar un break sin estar en turno" });
  }

  const openResult = await query("select id from breaks where employee_id = $1 and ended_at is null", [employeeId]);
  if (openResult.rows[0]) {
    return res.status(409).json({ error: "Ya hay un break en curso" });
  }

  const id = newId("br");
  await query(
    "insert into breaks (id, employee_id, attendance_id, started_at, date) values ($1, $2, $3, now(), $4)",
    [id, employeeId, attendanceId, todayDateStr()]
  );
  await query("update employees set status = 'pausa' where id = $1", [employeeId]);
  res.status(201).json({ id, startedAt: new Date().toISOString() });
});

// POST /api/breaks/end  { employeeId }  -- closes the open break and logs it as a "Break"
// activity so it shows up in the users' activity breakdown.
router.post("/end", requireDeviceToken, async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: "Falta employeeId" });

  const openResult = await query(
    "select * from breaks where employee_id = $1 and ended_at is null order by started_at desc limit 1",
    [employeeId]
  );
  const brk = openResult.rows[0];
  if (!brk) return res.status(400).json({ error: "No hay un break en curso para finalizar" });

  await query("update breaks set ended_at = now() where id = $1", [brk.id]);
  await query("update employees set status = 'activo' where id = $1", [employeeId]);

  const durationSeconds = Math.max(1, Math.round((Date.now() - new Date(brk.started_at).getTime()) / 1000));
  const employeeResult = await query("select name from employees where id = $1", [employeeId]);
  await query(
    `insert into activities (id, employee_id, employee_name, app, category, duration_seconds)
     values ($1, $2, $3, 'Break (10-31)', 'Break', $4)`,
    [newId("ac"), employeeId, employeeResult.rows[0]?.name || "", durationSeconds]
  );

  res.json({ ok: true, durationSeconds });
});

export default router;
