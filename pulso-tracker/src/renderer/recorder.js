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
      try {
        recMicStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
  recRecorder.onstop = () => {
    const durationSeconds = Math.round((Date.now() - chunkStartedAt) / 1000);
    const blob = new Blob(recChunks, { type: "video/webm" });
    if (blob.size > 0) uploadRecordingChunk(blob, durationSeconds);
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
  } catch (err) {
    console.error("No se pudo subir un pedazo de grabación:", err.message);
    window.pulso.logIssue?.("recording-upload", err.message);
  }
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
