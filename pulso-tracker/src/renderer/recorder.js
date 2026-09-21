// recorder.js — captura de pantalla del turno completo, en pedazos, subidos al servidor de a
// uno. Se prende al iniciar jornada (si la configuración del admin lo tiene activado) y se
// apaga al finalizarla. Comparte "state" y "apiGet" con app.js (mismo scope global, cargado
// después en index.html).

let recStream = null;
let recRecorder = null;
let recChunks = [];
let recConfig = null;
let recActive = false;
let recChunkTimer = null;
let recAudioContext = null;
let recMicStream = null;
let recPendingUpload = null;

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

async function startScreenRecording() {
  if (recActive) return;
  try {
    const sourceId = await window.pulso.getScreenSourceId();
    if (!sourceId) throw new Error("no se encontró una pantalla para grabar");

    // El audio del sistema (lo que suena por la compu, incluida una llamada si el operador
    // atiende una) viene del mismo origen de escritorio que el video — se pide junto.
    const desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: recConfig.audioEnabled ? { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } : false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          minFrameRate: recConfig.fps,
          maxFrameRate: recConfig.fps,
          maxWidth: recConfig.maxWidth || 1280,
        },
      },
    });

    if (!recConfig.audioEnabled) {
      recStream = desktopStream;
    } else {
      // El micrófono es una fuente aparte del audio de escritorio — se piden por separado y se
      // mezclan en una sola pista con el contexto de audio, para que MediaRecorder grabe ambas
      // voces (el operador y el pasajero) juntas.
      // Limite de tiempo como red de seguridad: si por lo que sea el pedido de microfono nunca
      // resuelve (puede pasar en Electron sin permiso configurado, o sin microfono en la compu),
      // esto no debe trabar la grabación de video para siempre.
      try {
        recMicStream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 5000)),
        ]);
      } catch (err) {
        console.error("No se pudo acceder al micrófono, sigue solo con audio del sistema:", err.message);
        window.pulso.logIssue?.("recording-start", `sin micrófono: ${err.message}`);
        recMicStream = null;
      }

      recAudioContext = new AudioContext();
      const destination = recAudioContext.createMediaStreamDestination();
      if (desktopStream.getAudioTracks().length > 0) {
        recAudioContext.createMediaStreamSource(new MediaStream(desktopStream.getAudioTracks())).connect(destination);
      }
      if (recMicStream) {
        recAudioContext.createMediaStreamSource(recMicStream).connect(destination);
      }

      recStream = new MediaStream([...desktopStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    }

    recActive = true;
    beginRecordingChunk();
  } catch (err) {
    console.error("No se pudo iniciar la grabación de pantalla:", err.message);
    window.pulso.logIssue?.("recording-start", err.message);
  }
}

function msUntilNextChunkBoundary() {
  // Como los husos horarios de EE.UU. son un número entero de horas respecto a UTC, alinear
  // por época (Date.now()) también alinea al reloj local — no hace falta convertir zona horaria.
  const boundaryMs = (recConfig.chunkMinutes || 5) * 60 * 1000;
  return boundaryMs - (Date.now() % boundaryMs);
}

function beginRecordingChunk() {
  if (!recStream) return;
  recChunks = [];
  const bitrate = REC_QUALITY_BITRATES[recConfig.quality] || REC_QUALITY_BITRATES.medium;
  const mimeType = recConfig.audioEnabled && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm;codecs=vp8";
  try {
    recRecorder = new MediaRecorder(recStream, { mimeType, videoBitsPerSecond: bitrate });
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
    if (blob.size > 0) recPendingUpload = uploadRecordingChunk(blob, Math.round(durationMs / 1000));
    if (recActive && recStream) beginRecordingChunk(); // sigue con el mismo stream, arranca el proximo pedazo
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

// Se llama cuando la app está por cerrarse (botón X, o "Salir" desde la bandeja) — corta el
// pedazo actual y espera a que termine de subirse, para no perder lo grabado hasta ese momento.
// No hay forma de cubrir un corte de luz o un apagado forzado de la compu — eso es inevitable
// con cualquier software — pero un cierre normal de la app ya no debería perder nada.
async function flushRecordingBeforeClose() {
  if (!recActive || !recRecorder || recRecorder.state !== "recording") return;
  recActive = false; // evita que arranque un pedazo nuevo despues de este stop
  clearTimeout(recChunkTimer);

  // recRecorder.stop() es asincrono — el 'onstop' (que dispara la subida) no corre en el
  // momento de llamarlo, as[i que hay que esperarlo de verdad antes de seguir.
  const previousOnStop = recRecorder.onstop;
  const stopped = new Promise((resolve) => {
    recRecorder.onstop = async (ev) => {
      await previousOnStop?.(ev); // esperar a que termine de verdad — incluye el arreglo de duración, que ahora es asincrónico
      resolve();
    };
  });
  recRecorder.stop();
  await stopped;

  if (recPendingUpload) {
    await recPendingUpload.catch(() => {});
  }

  if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; }
  if (recMicStream) { recMicStream.getTracks().forEach((t) => t.stop()); recMicStream = null; }
  if (recAudioContext) { recAudioContext.close().catch(() => {}); recAudioContext = null; }
}

function stopScreenRecording() {
  recActive = false;
  clearTimeout(recChunkTimer);
  if (recRecorder && recRecorder.state === "recording") {
    recRecorder.stop(); // el 'onstop' sube el ultimo pedazo; como recActive ya es false, no arranca uno nuevo
  }
  if (recStream) {
    recStream.getTracks().forEach((t) => t.stop());
    recStream = null;
  }
  if (recMicStream) {
    recMicStream.getTracks().forEach((t) => t.stop());
    recMicStream = null;
  }
  if (recAudioContext) {
    recAudioContext.close().catch(() => {});
    recAudioContext = null;
  }
}
