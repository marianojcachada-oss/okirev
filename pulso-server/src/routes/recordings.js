import { Router } from "express";
import { query, newId, todayDateStr } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";
import { isStorageConfigured, createUploadUrl, createPlaybackUrl } from "../storage.js";

const router = Router();

function mapSettings(row) {
  return {
    enabled: row.recording_enabled,
    fps: row.recording_fps,
    quality: row.recording_quality,
    chunkMinutes: row.recording_chunk_minutes,
    retentionDays: row.recording_retention_days,
    storageConfigured: isStorageConfigured(),
  };
}

// GET /api/recordings/settings — cualquier sesión válida puede leerlo (el tracker lo necesita
// para saber si tiene que grabar y con qué configuración).
router.get("/settings", requireSession, async (req, res) => {
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapSettings(rows[0]));
});

// PUT /api/recordings/settings — solo un admin con permiso de Ajustes puede cambiar esto.
router.put("/settings", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { enabled, fps, quality, chunkMinutes, retentionDays } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  if (enabled !== undefined) { fields.push(`recording_enabled = $${i++}`); values.push(!!enabled); }
  if (fps !== undefined) { fields.push(`recording_fps = $${i++}`); values.push(Number(fps)); }
  if (quality !== undefined) { fields.push(`recording_quality = $${i++}`); values.push(quality); }
  if (chunkMinutes !== undefined) { fields.push(`recording_chunk_minutes = $${i++}`); values.push(Number(chunkMinutes)); }
  if (retentionDays !== undefined) { fields.push(`recording_retention_days = $${i++}`); values.push(Number(retentionDays)); }
  if (fields.length > 0) {
    await query(`update settings set ${fields.join(", ")} where id = 1`, values);
  }
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapSettings(rows[0]));
});

// POST /api/recordings/upload-url — el tracker pide un lugar donde subir el próximo pedazo de
// su propia grabación. Siempre actúa sobre el empleado de la sesión, nunca sobre otro.
router.post("/upload-url", requireSession, async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({ error: "El almacenamiento de grabaciones no está configurado en el servidor todavía." });
  }
  const employeeId = req.session.employeeId;
  const id = newId("rec");
  const today = todayDateStr();
  const path = `${employeeId}/${today}/${id}.webm`;

  const { rows } = await query(
    `insert into screen_recordings (id, employee_id, employee_name, started_at, storage_path)
     values ($1, $2, $3, now(), $4) returning id`,
    [id, employeeId, req.session.name, path]
  );

  const { signedUrl, token } = await createUploadUrl(path);
  res.json({ recordingId: rows[0].id, uploadUrl: signedUrl, token, path });
});

// POST /api/recordings/:id/complete — confirma que un pedazo se subió bien y completa sus datos.
router.post("/:id/complete", requireSession, async (req, res) => {
  const { fileSizeBytes, durationSeconds } = req.body;
  const { rows } = await query(
    `update screen_recordings set ended_at = now(), file_size_bytes = $1, duration_seconds = $2
     where id = $3 and employee_id = $4 returning id`,
    [fileSizeBytes || null, durationSeconds || null, req.params.id, req.session.employeeId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Grabación no encontrada" });
  res.json({ ok: true });
});

// GET /api/recordings?employeeId=&date=YYYY-MM-DD — exclusivo de quien tenga permiso de
// Grabaciones (no viene incluido en ningún rol por default).
router.get("/", requireSession, requirePermission("grabaciones"), async (req, res) => {
  const { employeeId, date } = req.query;
  if (!employeeId || !date) return res.status(400).json({ error: "Faltan parámetros: employeeId, date" });
  const { rows } = await query(
    `select * from screen_recordings
     where employee_id = $1 and (started_at at time zone 'America/New_York')::date = $2
     order by started_at asc`,
    [employeeId, date]
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      startedAt: new Date(r.started_at).toISOString(),
      endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      durationSeconds: r.duration_seconds,
      fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
    }))
  );
});

// GET /api/recordings/:id/playback-url — misma exigencia de permiso. El bucket es privado, así
// que esta es la ÚNICA forma de conseguir un link que de verdad reproduzca el video.
router.get("/:id/playback-url", requireSession, requirePermission("grabaciones"), async (req, res) => {
  const { rows } = await query("select storage_path from screen_recordings where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Grabación no encontrada" });
  const url = await createPlaybackUrl(rows[0].storage_path);
  res.json({ url });
});

export default router;
