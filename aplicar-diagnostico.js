// Versión de diagnóstico para los cuelgues de PC. Hace dos cosas:
//   1) Deja rastro en el debug (oklrev-sync-debug.txt): datos de la PC (RAM, CPU, pantallas, placa de
//      video y driver), cierres de procesos internos (incluida la GPU), suspensión/bloqueo/reanudación
//      de Windows, cambios de pantallas, "pausas" del proceso (PC colgada) y consumo de CPU/memoria
//      del tracker cuando se dispara (más una línea de control cada 15 minutos).
//   2) Escalona el corte de cada pantalla (0 s, 5 s, 10 s...) para que no arranquen todas juntas a
//      los :00 y se junte todo el trabajo pesado (grabador nuevo + arreglo del video + subida).
// Uso (desde la carpeta "pulso", la que tiene pulso-tracker y pulso-server):  node aplicar-diagnostico.js
// Hace una copia .bak de cada archivo, y si un texto a cambiar no se encuentra, no toca ese archivo.
const fs = require("fs");
const path = require("path");

const DIAGNOSTICO = `// --- Diagnóstico de cuelgues: deja rastro en el debug para saber qué pasó con la PC ---
function startDiagnostics() {
  const { powerMonitor, screen } = require("electron");
  const mb = (bytes) => Math.round(bytes / 1048576);
  try {
    const pantallas = screen.getAllDisplays().map((d) => d.size.width + "x" + d.size.height + "@" + d.scaleFactor).join(", ");
    const cpus = os.cpus();
    const base = "v" + app.getVersion() + " | " + os.release() + " | RAM " + mb(os.totalmem()) + " MB | CPU " + cpus.length + "x " + ((cpus[0] && cpus[0].model) || "?") + " | pantallas " + screen.getAllDisplays().length + " (" + pantallas + ")";
    app.getGPUInfo("basic")
      .then((info) => {
        const gpus = ((info && info.gpuDevice) || []).map((g) => "vendor=" + g.vendorId + " device=" + g.deviceId + " driver=" + (g.driverVersion || "?") + (g.active ? " (activa)" : "")).join(" ; ");
        logSyncIssue("diag-inicio", base + " | GPU " + (gpus || "?"));
      })
      .catch(() => logSyncIssue("diag-inicio", base + " | GPU no disponible"));
  } catch (err) {
    logSyncIssue("diag-inicio", "no se pudo leer la info de la PC: " + err.message);
  }

  app.on("child-process-gone", (_event, d) => {
    logSyncIssue("child-process-gone", "type=" + d.type + " reason=" + d.reason + " exitCode=" + d.exitCode + (d.name ? " name=" + d.name : ""));
  });
  for (const ev of ["suspend", "resume", "lock-screen", "unlock-screen", "shutdown"]) {
    try { powerMonitor.on(ev, () => logSyncIssue("diag-energia", ev)); } catch {}
  }
  for (const ev of ["display-added", "display-removed"]) {
    try { screen.on(ev, () => logSyncIssue("diag-pantallas", ev + " (ahora " + screen.getAllDisplays().length + ")")); } catch {}
  }

  // Si el proceso estuvo parado varios segundos (PC colgada o en suspensión), queda anotado.
  let ultimoTick = Date.now();
  setInterval(() => {
    const ahora = Date.now();
    const parado = ahora - ultimoTick - 1000;
    ultimoTick = ahora;
    if (parado > 5000) logSyncIssue("diag-pausa", "el proceso estuvo " + Math.round((parado + 1000) / 1000) + " s sin correr (PC colgada o en suspensión)");
  }, 1000);

  // Consumo del tracker: se anota si se dispara, y una línea de control cada 15 minutos.
  let minutos = 0;
  setInterval(() => {
    try {
      minutos++;
      const procs = app.getAppMetrics();
      const cpu = procs.reduce((s, p) => s + ((p.cpu && p.cpu.percentCPUUsage) || 0), 0);
      const memMb = procs.reduce((s, p) => s + ((p.memory && p.memory.workingSetSize) || 0), 0) / 1024;
      const libreMb = mb(os.freemem());
      const librePct = (os.freemem() / os.totalmem()) * 100;
      const alerta = cpu > 80 || memMb > 1500 || librePct < 10;
      if (!alerta && minutos % 15 !== 0) return;
      const detalle = procs.map((p) => p.type + ":" + Math.round((p.cpu && p.cpu.percentCPUUsage) || 0) + "%/" + Math.round(((p.memory && p.memory.workingSetSize) || 0) / 1024) + "MB").join(" ");
      logSyncIssue(alerta ? "diag-recursos-ALTO" : "diag-recursos", "tracker CPU " + Math.round(cpu) + "% | " + Math.round(memMb) + " MB | RAM libre del sistema " + libreMb + " MB (" + Math.round(librePct) + "%) | " + detalle);
    } catch {}
  }, 60000);
}
app.whenReady().then(() => {
  if (typeof gotSingleInstanceLock === "undefined" || gotSingleInstanceLock) startDiagnostics();
});

`;

const CAMBIOS = [
  {
    archivo: "pulso-tracker/src/main.js",
    marca: "startDiagnostics",
    reemplazos: [
      { buscar: 'const syncLogPath = path.join(os.tmpdir(), "oklrev-sync-debug.txt");', poner: DIAGNOSTICO + 'const syncLogPath = path.join(os.tmpdir(), "oklrev-sync-debug.txt");' },
    ],
  },
  {
    archivo: "pulso-tracker/src/renderer/recorder.js",
    marca: "escalonado",
    reemplazos: [
      {
        buscar: "  }, msUntilNextChunkBoundary());\n}",
        poner: "  }, msUntilNextChunkBoundary() + session.screenIndex * 5000); // escalonado: cada pantalla corta unos segundos después de la anterior, no todas juntas\n}",
      },
      {
        buscar: 'let blob = new Blob(session.chunks, { type: "video/webm" });',
        poner: 'const procStart = Date.now();\n    let blob = new Blob(session.chunks, { type: "video/webm" });',
      },
      {
        buscar: "session.pendingUpload = uploadRecordingChunk(blob, Math.round(durationMs / 1000), session.screenIndex);",
        poner: `const procMs = Date.now() - procStart;
      if (procMs > 3000 || blob.size > 30 * 1024 * 1024) window.pulso.logIssue?.("recording-chunk", \`pantalla \${session.screenIndex}: procesar el pedazo tardó \${procMs} ms, pesa \${Math.round(blob.size / 1048576)} MB\`);
      session.pendingUpload = uploadRecordingChunk(blob, Math.round(durationMs / 1000), session.screenIndex);`,
      },
    ],
  },
];

let fallos = 0;
for (const c of CAMBIOS) {
  const ruta = path.resolve(process.cwd(), c.archivo);
  if (!fs.existsSync(ruta)) { console.log(`NO ENCONTRADO  ${c.archivo} (¿estás en la carpeta pulso?)`); fallos++; continue; }
  const txt = fs.readFileSync(ruta, "utf8");
  if (txt.includes(c.marca)) { console.log(`YA APLICADO    ${c.archivo}`); continue; }
  const crlf = txt.includes("\r\n");
  const adaptar = (s) => (crlf ? s.replace(/\r?\n/g, "\r\n") : s);
  let nuevo = txt;
  let ok = true;
  for (const r of c.reemplazos) {
    const buscar = adaptar(r.buscar);
    const n = nuevo.split(buscar).length - 1;
    if (n !== 1) { console.log(`NO SE PUDO     ${c.archivo}: el texto "${r.buscar.slice(0, 60)}…" aparece ${n} veces (se esperaba 1). No se tocó el archivo.`); ok = false; fallos++; break; }
    nuevo = nuevo.replace(buscar, () => adaptar(r.poner));
  }
  if (!ok) continue;
  fs.writeFileSync(ruta + ".bak", txt);
  fs.writeFileSync(ruta, nuevo);
  console.log(`APLICADO       ${c.archivo} (copia en ${c.archivo}.bak)`);
}

// Versión del tracker: 1.0.7 -> 1.0.8
const pj = path.resolve(process.cwd(), "pulso-tracker/package.json");
if (fs.existsSync(pj)) {
  const t = fs.readFileSync(pj, "utf8");
  if (t.includes('"version": "1.0.7"')) {
    fs.writeFileSync(pj + ".bak", t);
    fs.writeFileSync(pj, t.replace('"version": "1.0.7"', '"version": "1.0.8"'));
    console.log("APLICADO       pulso-tracker/package.json (versión 1.0.8)");
  } else {
    console.log('AVISO          package.json no tiene la versión 1.0.7: cambiá la versión a mano antes de compilar.');
  }
}
process.exit(fallos ? 1 : 0);
