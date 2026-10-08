import { query, todayDateStr } from "./db.js";
import { isStorageConfigured, deleteObjects, deleteFoldersBefore } from "./storage.js";

// Borra las grabaciones más viejas que "recording_retention_days" — el archivo real en Storage
// Y su fila de metadatos. Sin esto, el almacenamiento crece para siempre.
export async function cleanupOldRecordings() {
  if (!isStorageConfigured()) return 0;

  const settingsResult = await query("select recording_retention_days from settings where id = 1");
  const retentionDays = settingsResult.rows[0]?.recording_retention_days;
  if (!retentionDays || retentionDays <= 0) return 0;

  // 1) Por filas: archivo + fila, de a tandas. La fila solo se borra si su archivo se borró bien.
  let deleted = 0;
  for (;;) {
    const oldResult = await query(
      `select id, storage_path from screen_recordings where started_at < now() - ($1 || ' days')::interval limit 200`,
      [retentionDays]
    );
    if (oldResult.rows.length === 0) break;
    await deleteObjects(oldResult.rows.map((r) => r.storage_path));
    await query(`delete from screen_recordings where id = any($1::text[])`, [oldResult.rows.map((r) => r.id)]);
    deleted += oldResult.rows.length;
  }

  // 2) Por carpetas: archivos que quedaron sueltos en Storage (subidos pero sin fila, por ej.
  // si el tracker se cortó justo antes de avisar) y que la limpieza por filas nunca ve.
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const swept = await deleteFoldersBefore(todayDateStr(cutoff));

  if (deleted > 0 || swept > 0) {
    console.log(`[limpieza] borradas ${deleted} grabaciones vencidas (+${swept} archivos sueltos) — retención ${retentionDays} días`);
  }
  return deleted + swept;
}

// Antes corría UNA vez cada 24 h contadas desde que arrancaba el servidor. Como el servidor se
// reinicia seguido (Render lo reinicia por memoria o al desplegar), ese reloj de 24 h se
// reiniciaba también y la limpieza podía no ejecutarse nunca. Ahora corre poco después de
// arrancar y después cada 6 horas.
export function startRecordingCleanup() {
  const run = () => cleanupOldRecordings().catch((err) => console.error("Error limpiando grabaciones viejas:", err.message));
  setTimeout(run, 2 * 60 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
