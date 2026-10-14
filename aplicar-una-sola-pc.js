// Hace que el tracker informe desde qué PC reporta (nombre de la PC) en cada actividad y cada
// cambio de estado. Es la parte de main.js del cambio "una sola PC por jornada". El resto del
// tracker va en el archivo app.js que acompaña a este.
// Uso (desde la carpeta "pulso", la que tiene pulso-tracker y pulso-server):  node aplicar-una-sola-pc.js
// Hace una copia .bak, y si un texto a cambiar no se encuentra, no toca el archivo.
const fs = require("fs");
const path = require("path");

const archivo = "pulso-tracker/src/main.js";
const marca = "device: os.hostname()";
const reemplazos = [
  {
    buscar: "duration: formatDuration(record.durationMs),",
    poner: "duration: formatDuration(record.durationMs),\n          device: os.hostname(), // desde qué PC se reporta (el servidor descarta lo que llega de una PC que no es la de la jornada)",
  },
  {
    buscar: "body: JSON.stringify({ status, app: appLabel }),",
    poner: "body: JSON.stringify({ status, app: appLabel, device: os.hostname() }),",
  },
];

const ruta = path.resolve(process.cwd(), archivo);
if (!fs.existsSync(ruta)) { console.log(`NO ENCONTRADO  ${archivo} (¿estás en la carpeta pulso?)`); process.exit(1); }
const txt = fs.readFileSync(ruta, "utf8");
if (txt.includes(marca)) { console.log(`YA APLICADO    ${archivo}`); process.exit(0); }
const crlf = txt.includes("\r\n");
const adaptar = (s) => (crlf ? s.replace(/\r?\n/g, "\r\n") : s);
let nuevo = txt;
for (const r of reemplazos) {
  const n = nuevo.split(r.buscar).length - 1;
  if (n !== 1) { console.log(`NO SE PUDO     ${archivo}: el texto "${r.buscar.slice(0, 60)}…" aparece ${n} veces (se esperaba 1). No se tocó el archivo.`); process.exit(1); }
  nuevo = nuevo.replace(r.buscar, () => adaptar(r.poner));
}
fs.writeFileSync(ruta + ".bak", txt);
fs.writeFileSync(ruta, nuevo);
console.log(`APLICADO       ${archivo} (copia en ${archivo}.bak)`);
