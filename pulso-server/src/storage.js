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
  // De a tandas: mandar miles de rutas en un solo pedido puede fallar y dejar todo sin borrar.
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}

// ---- Subida directa del tracker a Storage ----

// URL de subida de UN solo archivo, en una ruta fija elegida por el servidor. El tracker sube
// el video directo a Supabase con esta URL: los bytes no pasan por Render. La URL sirve para
// esa ruta nada más (no para otras) y vence sola.
export async function createRecordingUploadUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// Datos reales del archivo guardado (tamaño), o null si no existe. Es lo que se usa para
// confirmar que la subida directa de verdad ocurrió antes de crear la fila en la base.
export async function getRecordingInfo(path) {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const filename = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: filename });
  if (error) throw new Error(error.message);
  const file = (data || []).find((f) => f.name === filename);
  if (!file) return null;
  return { size: Number(file.metadata?.size) || 0 };
}

// Pone límites al bucket (tamaño máximo por archivo y solo video/webm) para que nadie pueda
// subir otra cosa con una URL firmada. El bucket sigue siendo PRIVADO. Se intenta una vez al
// arrancar; si falla solo se avisa en el log (también se puede poner a mano desde Supabase →
// Storage → screen-recordings → Edit bucket).
export async function ensureBucketLimits(maxBytes) {
  if (!supabase) return;
  const { error } = await supabase.storage.updateBucket(BUCKET, {
    public: false,
    fileSizeLimit: maxBytes,
    allowedMimeTypes: ["video/webm"],
  });
  if (error) throw new Error(error.message);
}

// Borra carpetas de días vencidos DIRECTO en Storage (ruta: {empleado}/{YYYY-MM-DD}/archivo),
// sin depender de la base. Sirve para limpiar archivos que quedaron sueltos (subidos pero
// nunca registrados) y cualquier cosa que la limpieza por filas no haya alcanzado.
// `cutoffDate` = "YYYY-MM-DD": se borran los días estrictamente anteriores a esa fecha.
// `maxFiles` limita el trabajo de cada pasada.
export async function deleteFoldersBefore(cutoffDate, maxFiles = 2000) {
  const bucket = supabase.storage.from(BUCKET);
  let removed = 0;
  const listAll = async (prefix) => {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  const employees = (await listAll("")).filter((e) => e.id === null); // las carpetas no tienen id
  for (const emp of employees) {
    const days = (await listAll(emp.name)).filter((d) => d.id === null && /^\d{4}-\d{2}-\d{2}$/.test(d.name) && d.name < cutoffDate);
    for (const day of days) {
      if (removed >= maxFiles) return removed;
      const files = (await listAll(`${emp.name}/${day.name}`)).filter((f) => f.id !== null);
      const paths = files.map((f) => `${emp.name}/${day.name}/${f.name}`);
      await deleteObjects(paths);
      removed += paths.length;
    }
  }
  return removed;
}
