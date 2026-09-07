import { Router } from "express";
import { query } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();
router.use(requireSession, requirePermission("proyectos"));

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    progress: row.progress,
    hoursLogged: Number(row.hours_logged),
    hoursBudget: Number(row.hours_budget),
    state: row.state,
  };
}

// GET /api/projects
router.get("/", async (req, res) => {
  const { rows } = await query("select * from projects order by id");
  res.json(rows.map(mapRow));
});

export default router;
