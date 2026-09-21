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
    recStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
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
    recActive = true;
    beginRecordingChunk();
  } catch (err) {
    console.error("No se pudo iniciar la grabación de pantalla:", err.message);
    window.pulso.logIssue?.("recording-start", err.message);
  }
}

function beginRecordingChunk() {
  if (!recStream) return;
  recChunks = [];
  const bitrate = REC_QUALITY_BITRATES[recConfig.quality] || REC_QUALITY_BITRATES.medium;
  try {
    recRecorder = new MediaRecorder(recStream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: bitrate });
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
  recRecorder.start();
  clearTimeout(recChunkTimer);
  recChunkTimer = setTimeout(() => {
    if (recRecorder && recRecorder.state === "recording") recRecorder.stop();
  }, (recConfig.chunkMinutes || 5) * 60 * 1000);
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
}
