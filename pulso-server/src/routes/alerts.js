import { Router } from "express";
import { query, newId, nowHM } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();
router.use(requireSession, requirePermission("alertas"));

function mapRow(row) {
  return {
    id: row.id,
    severity: row.severity,
    type: row.type,
    employeeId: row.employee_id,
    employee: row.employee_name,
    detail: row.detail,
    time: row.time,
    status: row.status,
  };
}

// GET /api/alerts
router.get("/", async (req, res) => {
  const { rows } = await query("select * from alerts order by created_at desc");
  res.json(rows.map(mapRow));
});

// POST /api/alerts -> create a new alert (e.g. from an automated detection rule)
router.post("/", async (req, res) => {
  const { severity, type, employeeId, employee, detail, time } = req.body;
  if (!severity || !type || !detail) {
    return res.status(400).json({ error: "Faltan campos: severity, type y detail son obligatorios" });
  }
  const id = newId("a");
  const { rows } = await query(
    `insert into alerts (id, severity, type, employee_id, employee_name, detail, time, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'abierta') returning *`,
    [id, severity, type, employeeId || null, employee || "", detail, time || nowHM()]
  );
  res.status(201).json(mapRow(rows[0]));
});

// PATCH /api/alerts/:id -> { status: "revisada" | "abierta" }
router.patch("/:id", async (req, res) => {
  const { status } = req.body;
  if (!["abierta", "revisada"].includes(status)) {
    return res.status(400).json({ error: "status debe ser 'abierta' o 'revisada'" });
  }
  const { rows } = await query("update alerts set status = $1 where id = $2 returning *", [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Alerta no encontrada" });
  res.json(mapRow(rows[0]));
});

export default router;
