import { Router } from "express";
import { query, newId } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

function mapRow(row) {
  return { id: row.id, name: row.name, idleThresholdMinutes: row.idle_threshold_minutes, breakMinutes: row.break_minutes };
}

// GET /api/tracking-configs
router.get("/", requireSession, requirePermission("ajustes", "empleados"), async (req, res) => {
  const { rows } = await query("select * from tracking_configs order by name");
  res.json(rows.map(mapRow));
});

// POST /api/tracking-configs  { name, idleThresholdMinutes }
router.post("/", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { name, idleThresholdMinutes, breakMinutes } = req.body;
  const n = Number(idleThresholdMinutes);
  const b = Number(breakMinutes ?? 15);
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre" });
  if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: "Umbral de inactividad inválido" });
  if (!Number.isFinite(b) || b <= 0) return res.status(400).json({ error: "Minutos de break inválidos" });

  const id = newId("tc");
  try {
    await query("insert into tracking_configs (id, name, idle_threshold_minutes, break_minutes) values ($1, $2, $3, $4)", [id, name.trim(), n, b]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe una configuración con ese nombre" });
    throw err;
  }
  res.status(201).json({ id, name: name.trim(), idleThresholdMinutes: n, breakMinutes: b });
});

// PUT /api/tracking-configs/:id  { name, idleThresholdMinutes }
router.put("/:id", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { name, idleThresholdMinutes, breakMinutes } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
  if (idleThresholdMinutes !== undefined) {
    const n = Number(idleThresholdMinutes);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: "Umbral de inactividad inválido" });
    fields.push(`idle_threshold_minutes = $${i++}`);
    values.push(n);
  }
  if (breakMinutes !== undefined) {
    const b = Number(breakMinutes);
    if (!Number.isFinite(b) || b <= 0) return res.status(400).json({ error: "Minutos de break inválidos" });
    fields.push(`break_minutes = $${i++}`);
    values.push(b);
  }
  if (fields.length === 0) return res.status(400).json({ error: "Nada para actualizar" });
  values.push(req.params.id);
  try {
    const { rows } = await query(`update tracking_configs set ${fields.join(", ")} where id = $${i} returning id`, values);
    if (!rows[0]) return res.status(404).json({ error: "Configuración no encontrada" });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe una configuración con ese nombre" });
    throw err;
  }
  const result = await query("select * from tracking_configs where id = $1", [req.params.id]);
  res.json(mapRow(result.rows[0]));
});

// DELETE /api/tracking-configs/:id -- employees using it fall back to the company default.
router.delete("/:id", requireSession, requirePermission("ajustes"), async (req, res) => {
  await query("update employees set tracking_config_id = null where tracking_config_id = $1", [req.params.id]);
  const { rows } = await query("delete from tracking_configs where id = $1 returning id", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Configuración no encontrada" });
  res.json({ deleted: true });
});

// GET /api/tracking-configs/resolve/:employeeId -- NOT session-gated, the desktop tracker
// calls this directly (like it does with GET /settings) to know its idle threshold.
// Priority: per-employee override > assigned config group > company-wide default.
router.get("/resolve/:employeeId", async (req, res) => {
  const { rows } = await query(
    `select e.idle_threshold_minutes_override, tc.idle_threshold_minutes as config_minutes, s.idle_threshold_minutes as default_minutes
     from employees e
     left join tracking_configs tc on tc.id = e.tracking_config_id
     cross join settings s
     where e.id = $1 and s.id = 1`,
    [req.params.employeeId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Empleado no encontrado" });
  const idleThresholdMinutes = row.idle_threshold_minutes_override ?? row.config_minutes ?? row.default_minutes ?? 5;
  res.json({ idleThresholdMinutes });
});

export default router;
