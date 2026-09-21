// recorder.js — captura de pantalla del turno completo, en pedazos, subidos al servidor de a
// uno. Se prende al iniciar jornada (si la configuración del admin lo tiene activado) y se
// apaga al finalizarla. Comparte "state" y "apiGet" con app.js (mismo scope global, cargado
// después en index.html).
//
// Si el operador tiene más de un monitor, TODAS las pantallas se combinan en un solo video —
// se dibuja cada una en su lugar dentro de un lienzo (canvas) invisible, y se graba ese lienzo
// como si fuera una sola pantalla. El audio (sistema + micrófono) se mezcla una sola vez.

let recActive = false;
let recConfig = null;
let recLastFailedAt = null;

let recRecorder = null;
let recChunks = [];
let recChunkTimer = null;
let recPendingUpload = null;

let recCanvas = null;
let recDrawInterval = null;
let recScreenFeeds = []; // { videoEl, rawStream, cell: {x,y,w,h} }
let recMicStream = null;
let recAudioContext = null;
let recCanvasStream = null;
let recCombinedStream = null;

const REC_QUALITY_BITRATES = { low: 150000, medium: 350000, high: 800000 };

async function maybeStartRecording() {
  try {
    const settings = await apiGet(state.config.apiUrl, "/recordings/settings", state.config.sessionToken);
    if (!settings.enabled || !settings.storageConfigured) return;
    recConfig = settings;
    await startScreenRecording();
  } catch (err) {
    console.error("No se pudo chequear la configuración de grabación:", err.message);
  }
}

// Calcula dónde va cada pantalla dentro del lienzo combinado — una sola pantalla ocupa todo,
// dos van lado a lado, tres o cuatro en una grilla de 2x2.
function computeLayout(count, cellWidth, cellHeight) {
  const cols = count <= 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const cells = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({ x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight });
  }
  return { canvasWidth: cols * cellWidth, canvasHeight: rows * cellHeight, cells };
}

async function startScreenRecording() {
  if (recActive) return;
  // Si venía fallando, no reintentar más de una vez por minuto — sin esto, un problema
  // persistente en una compu puntual reintenta cada ~30s para siempre sin parar.
  if (recLastFailedAt && Date.now() - recLastFailedAt < 60000) return;
  try {
    const sourceIds = await window.pulso.getScreenSourceIds();
    if (!sourceIds || sourceIds.length === 0) throw new Error("no se encontró ninguna pantalla para grabar");

    const cellWidth = recConfig.maxWidth || 1280;
    const cellHeight = Math.round((cellWidth * 9) / 16); // se estira cada pantalla a este marco — simple y prolijo en la grilla

    // Un stream de VIDEO por pantalla — el audio se maneja aparte, una sola vez, no por pantalla.
    recScreenFeeds = [];
    for (const sourceId of sourceIds) {
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              minFrameRate: recConfig.fps,
              maxFrameRate: recConfig.fps,
              maxWidth: cellWidth,
            },
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado capturando video")), 8000)),
      ]);
      const videoEl = document.createElement("video");
      videoEl.muted = true;
      videoEl.srcObject = stream;
      // Limite de tiempo como red de seguridad: si por lo que sea play() nunca resuelve ni
      // falla (mismo tipo de problema que vimos antes con el permiso de micrófono), esto no
      // debe trabar el inicio de la grabación para siempre.
      await Promise.race([
        videoEl.play().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      recScreenFeeds.push({ videoEl, rawStream: stream });
    }

    const { canvasWidth, canvasHeight, cells } = computeLayout(recScreenFeeds.length, cellWidth, cellHeight);
    recScreenFeeds.forEach((feed, i) => { feed.cell = cells[i]; });

    recCanvas = document.createElement("canvas");
    recCanvas.width = canvasWidth;
    recCanvas.height = canvasHeight;
    const ctx = recCanvas.getContext("2d");
    clearInterval(recDrawInterval);
    recDrawInterval = setInterval(() => {
      for (const feed of recScreenFeeds) {
        if (feed.videoEl.readyState >= 2) {
          ctx.drawImage(feed.videoEl, feed.cell.x, feed.cell.y, feed.cell.w, feed.cell.h);
        }
      }
    }, 1000 / recConfig.fps);

    recCanvasStream = recCanvas.captureStream(recConfig.fps);

    // El audio del sistema no depende de qué pantalla se elija — se pide una sola vez, sin
    // importar cuál de las pantallas se use para pedirlo. Si falla (puede pasar en compus sin
    // un dispositivo de audio de salida activo/predeterminado, o con modo exclusivo prendido)
    // NO debe tirar abajo la grabación de video.
    let audioTracks = [];
    if (recConfig.audioEnabled) {
      let desktopAudioStream = null;
      try {
        desktopAudioStream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceIds[0] } },
            video: false,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 5000)),
        ]);
      } catch (err) {
        console.error("No se pudo capturar el audio del sistema, sigue solo con video:", err.message);
        window.pulso.logIssue?.("recording-start", `audio de sistema falló, sigue con video solo: ${err.message}`);
      }

      try {
        recMicStream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 5000)),
        ]);
      } catch (err) {
        console.error("No se pudo acceder al micrófono:", err.message);
        window.pulso.logIssue?.("recording-start", `sin micrófono: ${err.message}`);
        recMicStream = null;
      }

      if (desktopAudioStream || recMicStream) {
        recAudioContext = new AudioContext();
        const destination = recAudioContext.createMediaStreamDestination();
        if (desktopAudioStream) {
          recAudioContext.createMediaStreamSource(desktopAudioStream).connect(destination);
        }
        if (recMicStream) {
          recAudioContext.createMediaStreamSource(recMicStream).connect(destination);
        }
        audioTracks = destination.stream.getAudioTracks();
      }
    }

    recCombinedStream = new MediaStream([...recCanvasStream.getVideoTracks(), ...audioTracks]);

    recActive = true;
    beginRecordingChunk();
  } catch (err) {
    console.error("No se pudo iniciar la grabación de pantalla:", err.message);
    window.pulso.logIssue?.("recording-start", err.message);
    recLastFailedAt = Date.now();
    cleanupRecordingResources();
  }
}

function msUntilNextChunkBoundary() {
  // Como los husos horarios de EE.UU. son un número entero de horas respecto a UTC, alinear
  // por época (Date.now()) también alinea al reloj local — no hace falta convertir zona horaria.
  const boundaryMs = (recConfig.chunkMinutes || 5) * 60 * 1000;
  return boundaryMs - (Date.now() % boundaryMs);
}

function beginRecordingChunk() {
  if (!recCombinedStream) return;
  recChunks = [];
  const bitrate = REC_QUALITY_BITRATES[recConfig.quality] || REC_QUALITY_BITRATES.medium;
  const hasAudio = recCombinedStream.getAudioTracks().length > 0;
  const mimeType = hasAudio && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm;codecs=vp8";
  try {
    recRecorder = new MediaRecorder(recCombinedStream, { mimeType, videoBitsPerSecond: bitrate * Math.max(1, recScreenFeeds.length) });
  } catch (err) {
    console.error("No se pudo crear el grabador de video:", err.message);
    window.pulso.logIssue?.("recording-start", `MediaRecorder: ${err.message}`);
    return;
  }
  const chunkStartedAt = Date.now();
  recRecorder.ondataavailable = (e) => { if (e.data.size > 0) recChunks.push(e.data); };
  recRecorder.onstop = async () => {
    const durationMs = Date.now() - chunkStartedAt;
    let blob = new Blob(recChunks, { type: "video/webm" });
    // MediaRecorder no guarda la duración total del archivo, así que sin este arreglo el video
    // no se puede adelantar/rebobinar al reproducirlo (ni acá ni descargado aparte).
    if (blob.size > 0 && typeof ysFixWebmDuration === "function") {
      try {
        blob = await ysFixWebmDuration(blob, durationMs, { logger: false });
      } catch (err) {
        console.error("No se pudo arreglar la duración del video:", err.message);
      }
    }
    if (blob.size > 0) {
      recPendingUpload = uploadRecordingChunk(blob, Math.round(durationMs / 1000));
    }
    if (recActive && recCombinedStream) beginRecordingChunk(); // sigue con el mismo stream, arranca el proximo pedazo
  };
  recRecorder.start(1000); // pedirle datos cada 1s — sin esto, cuando el audio viene mezclado por AudioContext, MediaRecorder no entrega nada hasta el final
  clearTimeout(recChunkTimer);
  recChunkTimer = setTimeout(() => {
    if (recRecorder && recRecorder.state === "recording") recRecorder.stop();
  }, msUntilNextChunkBoundary());
}

async function uploadRecordingChunk(blob, durationSeconds) {
  try {
    const buffer = await blob.arrayBuffer();
    const res = await fetch(`${state.config.apiUrl}/recordings/upload?durationSeconds=${durationSeconds}`, {
      method: "POST",
      headers: { "Content-Type": "video/webm", Authorization: `Bearer ${state.config.sessionToken}` },
      body: buffer,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { id } = await res.json();
    captureThumbnail(blob)
      .then((thumbnail) => {
        if (!thumbnail) return;
        return fetch(`${state.config.apiUrl}/recordings/${id}/thumbnail`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.config.sessionToken}` },
          body: JSON.stringify({ thumbnail }),
        });
      })
      .catch((err) => console.error("No se pudo mandar la miniatura:", err.message));
  } catch (err) {
    console.error("No se pudo subir un pedazo de grabación:", err.message);
    window.pulso.logIssue?.("recording-upload", err.message);
  }
}

// Agarra un fotograma del video ya grabado (no de la pantalla en vivo, para no interferir con
// la grabación en curso) y lo achica a una imagen JPEG chica en base64 para mostrar en la lista.
// Si algo falla acá, no debe afectar la subida del video en sí — es solo un extra visual.
function captureThumbnail(blob) {
  return new Promise((resolve) => {
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.src = URL.createObjectURL(blob);
    const cleanup = () => URL.revokeObjectURL(videoEl.src);
    const fail = () => { cleanup(); resolve(null); };
    videoEl.onerror = fail;
    videoEl.onloadedmetadata = () => {
      // Un poco entrado, no el primer fotograma pelado (que a veces sale en negro/vacío)
      videoEl.currentTime = Math.min(0.5, (videoEl.duration || 1) * 0.1);
    };
    videoEl.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = Math.round((videoEl.videoHeight / videoEl.videoWidth) * 160) || 90;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        cleanup();
        resolve(dataUrl);
      } catch {
        fail();
      }
    };
    setTimeout(fail, 4000); // por si el video nunca termina de cargar/buscar
  });
}

function cleanupRecordingResources() {
  clearInterval(recDrawInterval);
  recDrawInterval = null;
  for (const feed of recScreenFeeds) {
    feed.videoEl.pause();
    feed.videoEl.srcObject = null;
    feed.rawStream.getTracks().forEach((t) => t.stop());
  }
  recScreenFeeds = [];
  if (recCanvasStream) { recCanvasStream.getTracks().forEach((t) => t.stop()); recCanvasStream = null; }
  if (recMicStream) { recMicStream.getTracks().forEach((t) => t.stop()); recMicStream = null; }
  if (recAudioContext) { recAudioContext.close().catch(() => {}); recAudioContext = null; }
  recCombinedStream = null;
  recCanvas = null;
}

// Se llama cuando la app está por cerrarse (botón X, o "Salir" desde la bandeja) — corta el
// pedazo actual y espera a que termine de subirse, para no perder lo grabado hasta ese momento.
// No hay forma de cubrir un corte de luz o un apagado forzado de la compu — eso es inevitable
// con cualquier software — pero un cierre normal de la app ya no debería perder nada.
async function flushRecordingBeforeClose() {
  if (!recActive || !recRecorder || recRecorder.state !== "recording") return;
  recActive = false; // evita que arranque un pedazo nuevo despues de este stop
  clearTimeout(recChunkTimer);

  const previousOnStop = recRecorder.onstop;
  const stopped = new Promise((resolve) => {
    recRecorder.onstop = async (ev) => {
      await previousOnStop?.(ev); // esperar a que termine de verdad — incluye el arreglo de duración, que es asincrónico
      resolve();
    };
  });
  recRecorder.stop();
  await stopped;

  if (recPendingUpload) {
    await recPendingUpload.catch(() => {});
  }

  cleanupRecordingResources();
}

function stopScreenRecording() {
  recActive = false;
  clearTimeout(recChunkTimer);
  if (recRecorder && recRecorder.state === "recording") {
    recRecorder.stop(); // el 'onstop' sube el ultimo pedazo; como recActive ya es false, no arranca uno nuevo
  }
  cleanupRecordingResources();
}
