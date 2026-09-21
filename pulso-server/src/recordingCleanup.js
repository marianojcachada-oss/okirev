import { query } from "./db.js";
import { isStorageConfigured, deleteObjects } from "./storage.js";

// Borra las grabaciones más viejas que "recording_retention_days" — tanto el archivo real en
// Storage como su fila de metadatos. Sin esto, el almacenamiento crece para siempre.
export async function cleanupOldRecordings() {
  if (!isStorageConfigured()) return 0;

  const settingsResult = await query("select recording_retention_days from settings where id = 1");
  const retentionDays = settingsResult.rows[0]?.recording_retention_days;
  if (!retentionDays || retentionDays <= 0) return 0;

  const oldResult = await query(
    `select id, storage_path from screen_recordings where started_at < now() - ($1 || ' days')::interval`,
    [retentionDays]
  );
  if (oldResult.rows.length === 0) return 0;

  await deleteObjects(oldResult.rows.map((r) => r.storage_path));
  await query(
    `delete from screen_recordings where id = any($1::text[])`,
    [oldResult.rows.map((r) => r.id)]
  );
  return oldResult.rows.length;
}

// Corre una vez por día — la retención se mide en días, no hace falta revisarlo más seguido.
export function startRecordingCleanup() {
  setInterval(() => {
    cleanupOldRecordings().catch((err) => console.error("Error limpiando grabaciones viejas:", err.message));
  }, 24 * 60 * 60 * 1000);
}
