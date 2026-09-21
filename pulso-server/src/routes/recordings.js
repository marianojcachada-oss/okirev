import express, { Router } from "express";
import { query, newId, todayDateStr } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";
import { isStorageConfigured, uploadRecording, createPlaybackUrl, recordingExists } from "../storage.js";

const router = Router();

function mapSettings(row) {
  return {
    enabled: row.recording_enabled,
    fps: row.recording_fps,
    quality: row.recording_quality,
    chunkMinutes: row.recording_chunk_minutes,
    retentionDays: row.recording_retention_days,
    maxWidth: row.recording_max_width,
    preset: row.recording_preset,
    audioEnabled: row.recording_audio_enabled,
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
  const { enabled, fps, quality, chunkMinutes, retentionDays, maxWidth, preset, audioEnabled } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  if (enabled !== undefined) { fields.push(`recording_enabled = $${i++}`); values.push(!!enabled); }
  if (fps !== undefined) { fields.push(`recording_fps = $${i++}`); values.push(Number(fps)); }
  if (quality !== undefined) { fields.push(`recording_quality = $${i++}`); values.push(quality); }
  if (chunkMinutes !== undefined) { fields.push(`recording_chunk_minutes = $${i++}`); values.push(Number(chunkMinutes)); }
  if (retentionDays !== undefined) { fields.push(`recording_retention_days = $${i++}`); values.push(Number(retentionDays)); }
  if (maxWidth !== undefined) { fields.push(`recording_max_width = $${i++}`); values.push(Number(maxWidth)); }
  if (preset !== undefined) { fields.push(`recording_preset = $${i++}`); values.push(preset); }
  if (audioEnabled !== undefined) { fields.push(`recording_audio_enabled = $${i++}`); values.push(!!audioEnabled); }
  if (fields.length > 0) {
    await query(`update settings set ${fields.join(", ")} where id = 1`, values);
  }
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapSettings(rows[0]));
});

// POST /api/recordings/upload — el tracker manda el video de un pedazo entero en el cuerpo del
// pedido (binario, no JSON). Un solo paso: sube a Storage y deja la fila en la base, todo junto.
// Siempre actúa sobre el empleado de la sesión, nunca sobre otro.
router.post("/upload", requireSession, express.raw({ type: "video/webm", limit: "50mb" }), async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({ error: "El almacenamiento de grabaciones no está configurado en el servidor todavía." });
  }
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: "No llegó ningún video en el pedido." });
  }
  const employeeId = req.session.employeeId;
  const id = newId("rec");
  const today = todayDateStr();
  const path = `${employeeId}/${today}/${id}.webm`;
  const durationSeconds = Number(req.query.durationSeconds) || null;

  await uploadRecording(path, req.body, "video/webm");

  await query(
    `insert into screen_recordings (id, employee_id, employee_name, started_at, ended_at, storage_path, file_size_bytes, duration_seconds)
     values ($1, $2, $3, now() - ($4 || ' seconds')::interval, now(), $5, $6, $7)`,
    [id, employeeId, req.session.name, durationSeconds || 0, path, req.body.length, durationSeconds]
  );

  res.json({ id, path });
});

// PUT /api/recordings/:id/thumbnail — una imagen chica en base64, mandada aparte del video
// (el cuerpo del upload principal es binario, no deja mezclar JSON en el mismo pedido). Solo
// puede tocar sus propias grabaciones.
router.put("/:id/thumbnail", requireSession, async (req, res) => {
  const { thumbnail } = req.body;
  if (!thumbnail) return res.status(400).json({ error: "Falta la miniatura" });
  const { rows } = await query(
    "update screen_recordings set thumbnail = $1 where id = $2 and employee_id = $3 returning id",
    [thumbnail, req.params.id, req.session.employeeId]
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
      thumbnail: r.thumbnail || null,
    }))
  );
});

// GET /api/recordings/:id/playback-url — misma exigencia de permiso. El bucket es privado, así
// que esta es la ÚNICA forma de conseguir un link que de verdad reproduzca el video.
router.get("/:id/playback-url", requireSession, requirePermission("grabaciones"), async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({ error: "El almacenamiento de grabaciones no está configurado en el servidor todavía." });
  }
  const { rows } = await query("select storage_path from screen_recordings where id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Grabación no encontrada" });
  // El archivo puede haberse borrado directo desde el dashboard de Supabase, sin pasar por
  // acá — en ese caso, la fila queda "huérfana". Confirmamos que el archivo sigue estando antes
  // de ofrecer el link, y si no está, limpiamos la fila sola para que deje de aparecer listada.
  const exists = await recordingExists(rows[0].storage_path);
  if (!exists) {
    await query("delete from screen_recordings where id = $1", [req.params.id]);
    return res.status(404).json({ error: "Este video ya no está disponible (se borró del almacenamiento)." });
  }
  const url = await createPlaybackUrl(rows[0].storage_path);
  res.json({ url });
});

export default router;
