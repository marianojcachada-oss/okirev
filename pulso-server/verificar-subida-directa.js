// Prueba de la subida directa contra TU Supabase real, sin tocar videos de operadores.
// Sube un archivo de prueba de 200 KB a la carpeta "__prueba__", lo confirma y lo borra.
//
// Uso (desde la carpeta pulso-server, con el .env cargado):   node verificar-subida-directa.js
//
// Resultado esperado: tres líneas "OK". Si la línea del "sin apikey" dice FALLÓ con 401,
// agregá la variable SUPABASE_ANON_KEY en Render (clave "anon public" de Supabase → Settings →
// API); es una clave pública por diseño, no la de servicio.
import "dotenv/config";
import { isStorageConfigured, createRecordingUploadUrl, getRecordingInfo, deleteObjects, ensureBucketLimits } from "./src/storage.js";

if (!isStorageConfigured()) { console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env"); process.exit(1); }
const anon = process.env.SUPABASE_ANON_KEY || null;
const body = new Uint8Array(200 * 1024);
const ok = (m) => { console.log("  OK     ", m); return true; };
const bad = (m) => { console.log("  FALLÓ  ", m); return false; };

async function intento(nombre, headers, usarFormulario) {
  const path = `__prueba__/${Date.now()}-${nombre.replace(/\W+/g, "")}.webm`;
  try {
    const url = await createRecordingUploadUrl(path);
    let res;
    if (usarFormulario) {
      const form = new FormData(); form.append("cacheControl", "3600"); form.append("", new Blob([body], { type: "video/webm" }), "video.webm");
      res = await fetch(url, { method: "PUT", headers, body: form });
    } else {
      res = await fetch(url, { method: "PUT", headers: { "Content-Type": "video/webm", ...headers }, body: new Blob([body], { type: "video/webm" }) });
    }
    if (!res.ok) return bad(`${nombre}: Storage respondió ${res.status} ${(await res.text()).slice(0, 120)}`);
    const info = await getRecordingInfo(path);
    if (!info || info.size !== body.length) return bad(`${nombre}: subió pero el tamaño guardado es ${info?.size}`);
    return ok(`${nombre} (guardó ${info.size} bytes)`);
  } catch (err) { return bad(`${nombre}: ${err.message}`); }
  finally { await deleteObjects([path]).catch(() => {}); }
}

console.log("Prueba de subida directa:");
const sinKey = (await intento("cuerpo crudo, sin apikey", {}, false)) || (await intento("formulario, sin apikey (plan B del tracker)", {}, true));
let conKey = false;
if (anon) conKey = await intento("cuerpo crudo, con apikey (SUPABASE_ANON_KEY)", { apikey: anon }, false);
else console.log("  (no hay SUPABASE_ANON_KEY en el .env; se probó solo sin apikey)");
const funciona = sinKey || conKey;

console.log("Límites del bucket (50 MB, solo video/webm):");
let limites = false;
try { await ensureBucketLimits(50 * 1024 * 1024); limites = ok("aplicados"); } catch (err) { bad(err.message); }

if (!funciona) console.log("\nNO funciona la subida directa. Si el error es 401 'No API key', cargá SUPABASE_ANON_KEY (ver arriba) y repetí. El tracker igual sigue subiendo por el servidor, no se pierde nada.");
else if (!sinKey) console.log("\nFunciona SOLO con apikey: cargá SUPABASE_ANON_KEY también en Render antes de sacar la versión nueva del tracker.");
else console.log("\nTodo bien: la subida directa funciona con tu Supabase.");
process.exit(funciona && limites ? 0 : 1);
