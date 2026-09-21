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

// URL firmada para que el tracker suba UN pedazo de video directo a Supabase Storage, sin
// pasar por nuestro propio servidor — evita que Render tenga que cargar con el peso de video
// de 56 operadores al mismo tiempo.
export async function createUploadUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return data; // { signedUrl, path, token }
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
