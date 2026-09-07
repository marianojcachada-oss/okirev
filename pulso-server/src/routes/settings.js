import { Router } from "express";
import crypto from "crypto";
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
    hasToken: !!row.desktop_token,
  };
}

// GET /api/settings -> never returns the raw token, only whether one exists.
router.get("/", async (req, res) => {
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapRow(rows[0]));
});

// PUT /api/settings  { companyName, timezone, idleThresholdMinutes }
router.put("/", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { companyName, timezone, idleThresholdMinutes, defaultBreakMinutes } = req.body;
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

// POST /api/settings/token -> generates and stores a new token for the desktop app.
// Returned in full only in this response, same as most real APIs.
router.post("/token", requireSession, requirePermission("ajustes"), async (req, res) => {
  const token = `oklrev_live_${crypto.randomBytes(12).toString("hex")}`;
  await query("update settings set desktop_token = $1 where id = 1", [token]);
  res.status(201).json({ token });
});

// DELETE /api/settings/token -> revokes the current token; check-in/checkout/activities
// become unauthenticated again until a new one is generated.
router.delete("/token", requireSession, requirePermission("ajustes"), async (req, res) => {
  await query("update settings set desktop_token = null where id = 1");
  res.json({ ok: true });
});

export default router;
