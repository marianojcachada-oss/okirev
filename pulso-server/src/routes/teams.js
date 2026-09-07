import { Router } from "express";
import { query, newId } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

// GET /api/teams -> just the list of team names; used by Equipos, and by Empleados/
// Asistencia/Actividades which all need the roster of teams too.
router.get("/", requireSession, requirePermission("equipos", "empleados", "asistencia", "actividades"), async (req, res) => {
  const { rows } = await query("select name from teams order by id");
  res.json(rows.map((r) => r.name));
});

// GET /api/teams/full -> {id, name} pairs, used by forms that need to set team_id
// (e.g. creating/editing an employee), and by the Equipos admin page.
router.get("/full", requireSession, requirePermission("equipos", "empleados"), async (req, res) => {
  const { rows } = await query("select id, name from teams order by id");
  res.json(rows);
});

// POST /api/teams  { name }
router.post("/", requireSession, requirePermission("equipos"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre del equipo" });
  const id = newId("t");
  try {
    await query("insert into teams (id, name) values ($1, $2)", [id, name.trim()]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un equipo con ese nombre" });
    throw err;
  }
  res.status(201).json({ id, name: name.trim() });
});

// PUT /api/teams/:id  { name }
router.put("/:id", requireSession, requirePermission("equipos"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre del equipo" });
  try {
    const { rows } = await query("update teams set name = $1 where id = $2 returning id", [name.trim(), req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Equipo no encontrado" });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un equipo con ese nombre" });
    throw err;
  }
  res.json({ id: req.params.id, name: name.trim() });
});

// DELETE /api/teams/:id -- employees on this team are left without one (team_id -> null).
router.delete("/:id", requireSession, requirePermission("equipos"), async (req, res) => {
  await query("update employees set team_id = null where team_id = $1", [req.params.id]);
  const { rows } = await query("delete from teams where id = $1 returning id", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Equipo no encontrado" });
  res.json({ deleted: true });
});

export default router;
