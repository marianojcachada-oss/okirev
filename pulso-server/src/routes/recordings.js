import { Router } from "express";
import { Transform, pipeline } from "node:stream";
import { query, newId, todayDateStr } from "../db.js";
import { requireSession, requirePermission } from "../middleware/requireSession.js";
import { isStorageConfigured, uploadRecordingStream, createPlaybackUrl, recordingExists, deleteObjects } from "../storage.js";

const router = Router();

// Mismo tope que tenía antes el express.raw: un pedazo de video no puede pasar de 50 MB.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function mapSettings(row, override) {
  return {
    enabled: row.recording_enabled,
    fps: override?.fps ?? row.recording_fps,
    quality: override?.quality ?? row.recording_quality,
    chunkMinutes: override?.chunk_minutes ?? row.recording_chunk_minutes,
    retentionDays: row.recording_retention_days,
    maxWidth: override?.max_width ?? row.recording_max_width,
    preset: row.recording_preset,
    audioEnabled: override?.audio_enabled ?? row.recording_audio_enabled,
    prioritySite: row.recording_priority_site || null,
    priorityWidth: row.recording_priority_width,
    secondaryWidth: row.recording_secondary_width,
    storageConfigured: isStorageConfigured(),
  };
}

// GET /api/recordings/settings — cualquier sesión válida puede leerlo (el tracker lo necesita
// para saber si tiene que grabar y con qué configuración). Si ese empleado tiene una excepción
// puntual (recording_overrides), se aplica acá — el tracker recibe todo ya combinado, sin
// enterarse de que existe el concepto de excepción.
router.get("/settings", requireSession, async (req, res) => {
  const { rows } = await query("select * from settings where id = 1");
  const { rows: overrideRows } = await query("select * from recording_overrides where employee_id = $1", [req.session.employeeId]);
  res.json(mapSettings(rows[0], overrideRows[0]));
});

// GET /api/recordings/settings/employee/:employeeId — para el panel: la configuración general
// MÁS la excepción de ese empleado en particular (si tiene), por separado, para poder mostrar
// cuáles campos están overrideados y cuáles siguen el valor general.
router.get("/settings/employee/:employeeId", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { rows } = await query("select * from settings where id = 1");
  const { rows: overrideRows } = await query("select * from recording_overrides where employee_id = $1", [req.params.employeeId]);
  const override = overrideRows[0] || null;
  res.json({
    general: mapSettings(rows[0]),
    override: override
      ? { fps: override.fps, quality: override.quality, chunkMinutes: override.chunk_minutes, maxWidth: override.max_width, audioEnabled: override.audio_enabled }
      : null,
  });
});

// PUT /api/recordings/settings/employee/:employeeId — fija una excepción para ESE empleado
// nada más. Solo los campos mandados se tocan; el resto queda como estaba (o sin excepción, si
// nunca tuvo una).
router.put("/settings/employee/:employeeId", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { fps, quality, chunkMinutes, maxWidth, audioEnabled } = req.body;
  await query(
    `insert into recording_overrides (employee_id, fps, quality, chunk_minutes, max_width, audio_enabled, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (employee_id) do update set
       fps = coalesce($2, recording_overrides.fps),
       quality = coalesce($3, recording_overrides.quality),
       chunk_minutes = coalesce($4, recording_overrides.chunk_minutes),
       max_width = coalesce($5, recording_overrides.max_width),
       audio_enabled = coalesce($6, recording_overrides.audio_enabled),
       updated_at = now()`,
    [req.params.employeeId, fps ?? null, quality ?? null, chunkMinutes ?? null, maxWidth ?? null, audioEnabled ?? null]
  );
  const { rows } = await query("select * from settings where id = 1");
  const { rows: overrideRows } = await query("select * from recording_overrides where employee_id = $1", [req.params.employeeId]);
  res.json(mapSettings(rows[0], overrideRows[0]));
});

// DELETE /api/recordings/settings/employee/:employeeId — saca la excepción entera, vuelve a
// seguir la configuración general.
router.delete("/settings/employee/:employeeId", requireSession, requirePermission("ajustes"), async (req, res) => {
  await query("delete from recording_overrides where employee_id = $1", [req.params.employeeId]);
  res.json({ ok: true });
});

// PUT /api/recordings/settings — solo un admin con permiso de Ajustes puede cambiar esto.
router.put("/settings", requireSession, requirePermission("ajustes"), async (req, res) => {
  const { enabled, fps, quality, chunkMinutes, retentionDays, maxWidth, preset, audioEnabled, prioritySite, priorityWidth, secondaryWidth } = req.body;
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
  if (prioritySite !== undefined) { fields.push(`recording_priority_site = $${i++}`); values.push(prioritySite || null); }
  if (priorityWidth !== undefined) { fields.push(`recording_priority_width = $${i++}`); values.push(Number(priorityWidth)); }
  if (secondaryWidth !== undefined) { fields.push(`recording_secondary_width = $${i++}`); values.push(Number(secondaryWidth)); }
  if (fields.length > 0) {
    await query(`update settings set ${fields.join(", ")} where id = 1`, values);
  }
  const { rows } = await query("select * from settings where id = 1");
  res.json(mapSettings(rows[0]));
});

// POST /api/recordings/upload — el tracker manda el video de un pedazo entero en el cuerpo del
// pedido (binario, no JSON). Un solo paso: sube a Storage y deja la fila en la base, todo junto.
// Siempre actúa sobre el empleado de la sesión, nunca sobre otro.
//
// El video se pasa a Storage EN STREAMING (sin guardarlo entero en la memoria del servidor):
// antes se cargaba cada pedazo completo con express.raw, y con muchos operadores subiendo a la
// vez el servidor (512 MB de RAM) se quedaba sin memoria y Render lo reiniciaba.
router.post("/upload", requireSession, async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({ error: "El almacenamiento de grabaciones no está configurado en el servidor todavía." });
  }
  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const declaredLength = req.headers["content-length"] !== undefined ? Number(req.headers["content-length"]) : null;
  if (contentType !== "video/webm" || declaredLength === 0) {
    req.resume();
    return res.status(400).json({ error: "No llegó ningún video en el pedido." });
  }
  if (declaredLength !== null && declaredLength > MAX_UPLOAD_BYTES) {
    req.resume();
    return res.status(413).json({ error: "El video supera el tamaño máximo permitido." });
  }

  const employeeId = req.session.employeeId;
  const id = newId("rec");
  const today = todayDateStr();
  const screenIndex = Number(req.query.screenIndex) || 0;
  const path = `${employeeId}/${today}/screen${screenIndex}-${id}.webm`;
  const durationSeconds = Number(req.query.durationSeconds) || null;

  // Cuenta los bytes que pasan (para guardar el tamaño real en la base) y corta el pedido si
  // se pasa del tope aunque no haya declarado su tamaño.
  let receivedBytes = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_UPLOAD_BYTES) return cb(new Error("El video supera el tamaño máximo permitido."));
      cb(null, chunk);
    },
  });
  pipeline(req, meter, () => {}); // si el tracker corta la conexión a mitad, meter se destruye y la subida falla limpia

  try {
    await uploadRecordingStream(path, meter, "video/webm", declaredLength || undefined);
  } catch (err) {
    console.error(`[recordings] falló la subida de ${path}: ${err.message}`);
    if (!res.headersSent) {
      const tooBig = receivedBytes > MAX_UPLOAD_BYTES;
      return res.status(tooBig ? 413 : 502).json({ error: tooBig ? "El video supera el tamaño máximo permitido." : "No se pudo guardar el video. Se reintenta solo." });
    }
    return;
  }

  if (receivedBytes === 0) {
    await deleteObjects([path]).catch(() => {});
    return res.status(400).json({ error: "No llegó ningún video en el pedido." });
  }

  await query(
    `insert into screen_recordings (id, employee_id, employee_name, started_at, ended_at, storage_path, file_size_bytes, duration_seconds, screen_index)
     values ($1, $2, $3, now() - ($4 || ' seconds')::interval, now(), $5, $6, $7, $8)`,
    [id, employeeId, req.session.name, durationSeconds || 0, path, receivedBytes, durationSeconds, screenIndex]
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
      screenIndex: r.screen_index,
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
