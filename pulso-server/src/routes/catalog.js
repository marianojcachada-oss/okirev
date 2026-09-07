import { Router } from "express";
import { query } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();
router.use(requireSession, requirePermission("catalogo"));

const VALID_CATEGORIES = ["Productiva", "Neutral", "Improductiva", "sin_clasificar"];

function mapRow(row) {
  return {
    appLabel: row.app_label,
    category: row.category,
    firstSeenAt: row.first_seen_at,
  };
}

// GET /api/catalog?filter=unclassified
router.get("/", async (req, res) => {
  const where = req.query.filter === "unclassified" ? "where category = 'sin_clasificar'" : "";
  const { rows } = await query(`select * from app_catalog ${where} order by first_seen_at desc`);
  res.json(rows.map(mapRow));
});

// PUT /api/catalog/:appLabel  { category }
router.put("/:appLabel", async (req, res) => {
  const { category } = req.body;
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Categoría inválida" });
  }
  const { rows } = await query(
    "update app_catalog set category = $1 where app_label = $2 returning *",
    [category, req.params.appLabel]
  );
  if (!rows[0]) return res.status(404).json({ error: "No encontrado en el catálogo" });
  res.json(mapRow(rows[0]));
});

export default router;
