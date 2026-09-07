import { Router } from "express";
import { query, newId } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();
router.use(requireSession, requirePermission("ajustes"));

function mapRow(row) {
  return { id: row.id, name: row.name, permissions: row.permissions || [] };
}

// GET /api/roles
router.get("/", async (req, res) => {
  const { rows } = await query("select * from roles order by name");
  res.json(rows.map(mapRow));
});

// POST /api/roles  { name, permissions }
router.post("/", async (req, res) => {
  const { name, permissions } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre del rol" });
  const id = newId("r");
  try {
    await query("insert into roles (id, name, permissions) values ($1, $2, $3)", [id, name.trim(), permissions || []]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un rol con ese nombre" });
    throw err;
  }
  const result = await query("select * from roles where id = $1", [id]);
  res.status(201).json(mapRow(result.rows[0]));
});

// PUT /api/roles/:id  { name, permissions }
router.put("/:id", async (req, res) => {
  const { name, permissions } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
  if (permissions !== undefined) { fields.push(`permissions = $${i++}`); values.push(permissions); }
  if (fields.length === 0) return res.status(400).json({ error: "Nada para actualizar" });
  values.push(req.params.id);
  try {
    const { rows } = await query(`update roles set ${fields.join(", ")} where id = $${i} returning id`, values);
    if (!rows[0]) return res.status(404).json({ error: "Rol no encontrado" });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un rol con ese nombre" });
    throw err;
  }
  const result = await query("select * from roles where id = $1", [req.params.id]);
  res.json(mapRow(result.rows[0]));
});

// DELETE /api/roles/:id -- employees with this role are left without one (role_id -> null),
// not deleted.
router.delete("/:id", async (req, res) => {
  await query("update employees set role_id = null where role_id = $1", [req.params.id]);
  const { rows } = await query("delete from roles where id = $1 returning id", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Rol no encontrado" });
  res.json({ deleted: true });
});

export default router;
