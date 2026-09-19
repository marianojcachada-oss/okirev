import { Router } from "express";
import { query } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";

const router = Router();

function mapRow(row) {
  return {
    companyName: row.company_name,
    timezone: row.timezone,
    idleThresholdMinutes: row.idle_threshold_minutes,
    defaultBreakMinutes: row.default_break_minutes,
    prohibitedApps: row.prohibited_apps || [],
    prohibitedAppsAlertsEnabled: row.prohibited_apps_alerts_enabled,
  };
}

// GET /api/settings -> never returns the raw token, only whether one exists.
router.get("/", async (req, res) => {
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapRow(rows[0]));
});

// PUT /api/settings  { companyName, timezone, idleThresholdMinutes }
router.put("/", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { companyName, timezone, idleThresholdMinutes, defaultBreakMinutes, prohibitedAppsAlertsEnabled } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

  if (companyName !== undefined) { fields.push(`company_name = $${i++}`); values.push(companyName); }
  if (timezone !== undefined) { fields.push(`timezone = $${i++}`); values.push(timezone); }
  if (idleThresholdMinutes !== undefined) {
    const n = Number(idleThresholdMinutes);
    if (Number.isFinite(n) && n > 0) { fields.push(`idle_threshold_minutes = $${i++}`); values.push(n); }
  }
  if (defaultBreakMinutes !== undefined) {
    const b = Number(defaultBreakMinutes);
    if (Number.isFinite(b) && b > 0) { fields.push(`default_break_minutes = $${i++}`); values.push(b); }
  }
  if (prohibitedAppsAlertsEnabled !== undefined) {
    fields.push(`prohibited_apps_alerts_enabled = $${i++}`);
    values.push(!!prohibitedAppsAlertsEnabled);
  }

  if (fields.length > 0) {
    await query(`update settings set ${fields.join(", ")} where id = 1`, values);
  }

  const { rows } = await query("select * from settings where id = 1");
  res.json(mapRow(rows[0]));
});

// POST /api/settings/prohibited-apps  { name }
router.post("/prohibited-apps", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Falta el nombre de la aplicación" });
  const { rows } = await query(
    `update settings
     set prohibited_apps = case when $1 = any(prohibited_apps) then prohibited_apps else array_append(prohibited_apps, $1) end
     where id = 1
     returning prohibited_apps`,
    [name.trim()]
  );
  res.status(201).json(rows[0].prohibited_apps);
});

// DELETE /api/settings/prohibited-apps/:name
router.delete("/prohibited-apps/:name", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { rows } = await query(
    `update settings set prohibited_apps = array_remove(prohibited_apps, $1) where id = 1 returning prohibited_apps`,
    [req.params.name]
  );
  res.json(rows[0].prohibited_apps);
});

export default router;
