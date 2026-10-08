import http from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";
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

// Sube un pedazo EN STREAMING: los bytes que llegan del tracker se van pasando a Supabase
// a medida que llegan, sin acumular el video entero en la memoria del servidor. Es el mismo
// pedido que arma el SDK por dentro cuando se le pasa un Buffer (POST con el cuerpo crudo,
// content-type, x-upsert, cache-control), solo que con el cuerpo como stream en vez de Buffer.
// Con un plan de 512 MB de RAM, cargar cada pedazo completo (y varios a la vez) reventaba la
// memoria; así el consumo por subida es casi constante sin importar el tamaño del video.
// `contentLength` (si se conoce) se manda como content-length para que Supabase reciba el
// pedido con tamaño declarado y no en transferencia "chunked".
//
// OJO: se usa el módulo http/https clásico de Node con pipeline() y NO fetch() a propósito. Se
// midió: con fetch() y un cuerpo en stream, Node acumula en memoria casi todo lo que le llega
// (≈300 MB para 20 subidas simultáneas de 20 MB); con http.request + pipeline la contrapresión
// funciona de punta a punta y el pico fue de ≈28 MB para la misma carga.
export function uploadRecordingStream(path, nodeReadable, contentType, contentLength) {
  return new Promise((resolve, reject) => {
    const base = String(process.env.SUPABASE_URL).replace(/\/+$/, "");
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const target = new URL(`${base}/storage/v1/object/${BUCKET}/${encodedPath}`);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": contentType,
      "cache-control": "max-age=3600",
      "x-upsert": "true",
    };
    if (contentLength) headers["content-length"] = String(contentLength);

    const lib = target.protocol === "http:" ? http : https;
    const out = lib.request(target, { method: "POST", headers }, (res) => {
      const parts = [];
      res.on("data", (c) => { if (parts.length < 8) parts.push(c); }); // solo se guarda un trozo del cuerpo (para el mensaje de error)
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve();
        reject(new Error(`Storage respondió ${res.statusCode}: ${Buffer.concat(parts).toString().slice(0, 200)}`));
      });
      res.on("error", reject);
    });
    out.setTimeout(120000, () => out.destroy(new Error("Storage no respondió a tiempo (120 s).")));
    out.on("error", reject);
    pipeline(nodeReadable, out, (err) => { if (err) reject(err); });
  });
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
