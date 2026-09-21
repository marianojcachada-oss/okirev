import { createClient } from "@supabase/supabase-js";

const BUCKET = "screen-recordings";

// Requiere dos variables de entorno DISTINTAS a DATABASE_URL: SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY (las dos se sacan del dashboard de Supabase, en
// Settings → API — no son las mismas credenciales que la conexión a la base de datos).
// Si no están configuradas, la grabación de pantalla simplemente no va a funcionar
// (el resto de la app sigue andando normal).
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function isStorageConfigured() {
  return supabase !== null;
}

// Sube un pedazo de grabación directo, usando la clave de servicio — no necesita URLs firmadas
// ni entender el formato multipart que espera Supabase para esas URLs (confirmado que ese
// camino tiene detalles delicados: el propio SDK arma un FormData por dentro, no es un PUT
// simple). Este método, con la clave de servicio, es mucho más directo y menos propenso a fallar.
export async function uploadRecording(path, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

// Confirma si el archivo sigue existiendo de verdad en Storage — una URL firmada se genera
// igual aunque el archivo ya no esté (la firma no depende de que exista), así que esta es la
// única forma real de saberlo antes de ofrecerle el link a alguien.
export async function recordingExists(path) {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const filename = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: filename });
  if (error) return false;
  return (data || []).some((f) => f.name === filename);
}

// URL firmada para que el panel pueda REPRODUCIR un video guardado — el bucket es privado, así
// que nadie puede verlo sin pasar primero por esta ruta (que exige permiso de "grabaciones").
export async function createPlaybackUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteObjects(paths) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}
