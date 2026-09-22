// recorder.js — captura de pantalla del turno completo, en pedazos, subidos al servidor de a
// uno. Se prende al iniciar jornada (si la configuración del admin lo tiene activado) y se
// apaga al finalizarla. Comparte "state" y "apiGet" con app.js (mismo scope global, cargado
// después en index.html).
//
// Si el operador tiene más de un monitor, se graba cada uno como una sesión completamente
// aparte, en paralelo — sin lienzo, sin elementos de video intermedios, sin composición
// ninguna acá. Combinar todo en una sola vista es trabajo del panel al momento de REVISAR, no
// de la compu del operador al momento de GRABAR — eso es justo lo que causaba las caídas.
// El audio (sistema + micrófono) solo se suma a la primera pantalla, para no duplicarlo.

let recActive = false; // hay una jornada con grabación prendida, en general (no por pantalla)
let recConfig = null;
let recLastFailedAt = null;
let recSessions = []; // una entrada por pantalla: { screenIndex, stream, recorder, chunks, chunkTimer, pendingUpload, micStream, audioContext }
let currentPriorityScreenIndex = null; // qué pantalla tuvo más tiempo el sitio priorizado — null si no hay sitio configurado o sin datos todavía
let priorityUpdateTimer = null;

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
  // Si venía fallando, no reintentar más de una vez por minuto — sin esto, un problema
  // persistente en una compu puntual reintenta cada ~30s para siempre sin parar.
  if (recLastFailedAt && Date.now() - recLastFailedAt < 60000) return;
  try {
    const sourceIds = await window.pulso.getScreenSourceIds();
    if (!sourceIds || sourceIds.length === 0) throw new Error("no se encontró ninguna pantalla para grabar");

    recSessions = [];
    for (let screenIndex = 0; screenIndex < sourceIds.length; screenIndex++) {
      const session = await startSessionForScreen(sourceIds[screenIndex], screenIndex, screenIndex === 0);
      if (session) recSessions.push(session);
    }
    if (recSessions.length === 0) throw new Error("no se pudo iniciar la captura en ninguna pantalla");

    recActive = true;

    // "Priorizar calidad según sitio" — si hay uno configurado, se le avisa al tracker (que ya
    // sondea la ventana en primer plano) para que empiece a acumular en qué pantalla estuvo. Se
    // lee y decide "quién ganó" alineado a los mismos límites de pedazo (cada N minutos), no al
    // instante — MediaRecorder no permite cambiar la calidad a mitad de una grabación en curso.
    clearInterval(priorityUpdateTimer);
    currentPriorityScreenIndex = null;
    if (recConfig.prioritySite) {
      await window.pulso.setPrioritySite?.(recConfig.prioritySite);
      const boundaryMs = (recConfig.chunkMinutes || 5) * 60 * 1000;
      const updateLeader = async () => { currentPriorityScreenIndex = await window.pulso.getPriorityScreen?.(); };
      setTimeout(() => {
        updateLeader();
        priorityUpdateTimer = setInterval(updateLeader, boundaryMs);
      }, msUntilNextChunkBoundary());
    } else {
      await window.pulso.setPrioritySite?.(null);
    }

    for (const session of recSessions) await beginRecordingChunk(session);
  } catch (err) {
    console.error("No se pudo iniciar la grabación de pantalla:", err.message);
    window.pulso.logIssue?.("recording-start", err.message);
    recLastFailedAt = Date.now();
  }
}

// Arma la sesión de UNA pantalla puntual — el audio (sistema + micrófono) solo se intenta si
// "withAudio" es true (reservado para la primera pantalla nada más). Nada de lienzo acá: el
// video de esta pantalla se graba tal cual viene.
async function startSessionForScreen(sourceId, screenIndex, withAudio) {
  const videoConstraints = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      minFrameRate: recConfig.fps,
      maxFrameRate: recConfig.fps,
      maxWidth: recConfig.maxWidth || 1280,
    },
  };

  // El video se pide siempre — es lo mínimo garantizado. El audio del sistema se intenta junto
  // primero, pero si falla (puede pasar en compus sin un dispositivo de audio de salida
  // activo/predeterminado, o con modo exclusivo prendido) NO debe tirar abajo la grabación de
  // video — se reintenta sin audio.
  let desktopStream;
  let desktopAudioOk = false;
  if (recConfig.audioEnabled && withAudio) {
    try {
      desktopStream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } },
          video: videoConstraints,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 8000)),
      ]);
      desktopAudioOk = desktopStream.getAudioTracks().length > 0;
    } catch (err) {
      console.error("No se pudo capturar el audio del sistema, sigue solo con video:", err.message);
      window.pulso.logIssue?.("recording-start", `audio de sistema falló, sigue con video solo: ${err.message}`);
    }
  }
  if (!desktopStream) {
    desktopStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado capturando video")), 8000)),
    ]);
  }

  const session = {
    screenIndex, sourceId, chunks: [], chunkTimer: null, pendingUpload: null, micStream: null, audioContext: null,
    currentWidth: recConfig.maxWidth || 1280,
  };

  if (!recConfig.audioEnabled || !withAudio) {
    session.stream = desktopStream;
    return session;
  }

  // El micrófono es una fuente aparte del audio de escritorio — se pide por separado.
  // Límite de tiempo como red de seguridad: si por lo que sea el pedido de micrófono nunca
  // resuelve, esto no debe trabar la grabación de video para siempre.
  try {
    session.micStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 5000)),
    ]);
  } catch (err) {
    console.error("No se pudo acceder al micrófono:", err.message);
    window.pulso.logIssue?.("recording-start", `sin micrófono: ${err.message}`);
    session.micStream = null;
  }

  if (desktopAudioOk || session.micStream) {
    // Al menos una fuente de audio funcionó — se mezclan en una sola pista con el contexto de
    // audio (si son dos) o se usa la única disponible.
    session.audioContext = new AudioContext();
    const destination = session.audioContext.createMediaStreamDestination();
    if (desktopAudioOk) {
      session.audioContext.createMediaStreamSource(new MediaStream(desktopStream.getAudioTracks())).connect(destination);
    }
    if (session.micStream) {
      session.audioContext.createMediaStreamSource(session.micStream).connect(destination);
    }
    session.stream = new MediaStream([...desktopStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  } else {
    // Ni el audio de sistema ni el micrófono estuvieron disponibles — sigue solo con video, en
    // vez de perder la grabación entera por esto.
    session.stream = desktopStream;
  }

  return session;
}

function msUntilNextChunkBoundary() {
  // Como los husos horarios de EE.UU. son un número entero de horas respecto a UTC, alinear
  // por época (Date.now()) también alinea al reloj local — no hace falta convertir zona horaria.
  const boundaryMs = (recConfig.chunkMinutes || 5) * 60 * 1000;
  return boundaryMs - (Date.now() % boundaryMs);
}

// Si hay un sitio priorizado configurado, decide a qué ancho debe grabar esta pantalla en el
// pedazo que está por arrancar, y si cambió respecto al pedazo anterior, vuelve a pedir la
// captura de video a ese nuevo ancho — sin tocar el audio, que sigue funcionando igual sin
// importar la resolución del video.
async function maybeSwitchResolution(session) {
  if (!recConfig.prioritySite) return;
  // Todavía no hay ningún dato acumulado (recién arrancando, o la primera ronda no terminó) —
  // se graba a la resolución normal para todas, en vez de asumir que esta pantalla "perdió".
  if (currentPriorityScreenIndex === null) {
    if (session.currentWidth === (recConfig.maxWidth || 1280)) return;
    session.currentWidth = recConfig.maxWidth || 1280; // se corrige recién en el próximo pedazo real (abajo)
  }
  const targetWidth = session.screenIndex === currentPriorityScreenIndex
    ? (recConfig.priorityWidth || 1280)
    : (recConfig.secondaryWidth || 960);
  if (targetWidth === session.currentWidth) return;

  try {
    const newVideoStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: session.sourceId,
            minFrameRate: recConfig.fps,
            maxFrameRate: recConfig.fps,
            maxWidth: targetWidth,
          },
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("tiempo de espera agotado")), 8000)),
    ]);
    const oldVideoTracks = session.stream.getVideoTracks();
    const audioTracks = session.stream.getAudioTracks(); // se conservan tal cual, no dependen de la resolución
    session.stream = new MediaStream([...newVideoStream.getVideoTracks(), ...audioTracks]);
    oldVideoTracks.forEach((t) => t.stop());
    session.currentWidth = targetWidth;
  } catch (err) {
    console.error(`No se pudo cambiar la resolución de la pantalla ${session.screenIndex}, sigue con la anterior:`, err.message);
    window.pulso.logIssue?.("recording-start", `cambio de resolución (pantalla ${session.screenIndex}) falló: ${err.message}`);
  }
}

async function beginRecordingChunk(session) {
  await maybeSwitchResolution(session);
  if (!session.stream) return;
  session.chunks = [];
  // La compresión sigue la misma calidad configurada, pero proporcional al ancho real de esta
  // pantalla en este pedazo — una pantalla a 960px no necesita tantos bits como una a 1280px
  // para verse igual de bien, así que graba más liviana sin perder nitidez relativa.
  const baseBitrate = REC_QUALITY_BITRATES[recConfig.quality] || REC_QUALITY_BITRATES.medium;
  const baseWidth = recConfig.maxWidth || 1280;
  const bitrate = Math.round(baseBitrate * (session.currentWidth / baseWidth));
  const hasAudio = session.stream.getAudioTracks().length > 0;
  const mimeType = hasAudio && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm;codecs=vp8";
  try {
    session.recorder = new MediaRecorder(session.stream, { mimeType, videoBitsPerSecond: bitrate });
  } catch (err) {
    console.error("No se pudo crear el grabador de video:", err.message);
    window.pulso.logIssue?.("recording-start", `MediaRecorder (pantalla ${session.screenIndex}): ${err.message}`);
    return;
  }
  const chunkStartedAt = Date.now();
  session.recorder.ondataavailable = (e) => { if (e.data.size > 0) session.chunks.push(e.data); };
  session.recorder.onstop = async () => {
    const durationMs = Date.now() - chunkStartedAt;
    let blob = new Blob(session.chunks, { type: "video/webm" });
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
      session.pendingUpload = uploadRecordingChunk(blob, Math.round(durationMs / 1000), session.screenIndex);
    }
    if (recActive && session.stream) await beginRecordingChunk(session); // arranca el proximo pedazo (puede cambiar de resolución acá, si corresponde)
  };
  session.recorder.start(1000); // pedirle datos cada 1s — sin esto, cuando el audio viene mezclado por AudioContext, MediaRecorder no entrega nada hasta el final
  clearTimeout(session.chunkTimer);
  session.chunkTimer = setTimeout(() => {
    if (session.recorder && session.recorder.state === "recording") session.recorder.stop();
  }, msUntilNextChunkBoundary());
}

async function uploadRecordingChunk(blob, durationSeconds, screenIndex) {
  try {
    const buffer = await blob.arrayBuffer();
    const res = await fetch(
      `${state.config.apiUrl}/recordings/upload?durationSeconds=${durationSeconds}&screenIndex=${screenIndex}`,
      {
        method: "POST",
        headers: { "Content-Type": "video/webm", Authorization: `Bearer ${state.config.sessionToken}` },
        body: buffer,
      }
    );
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
    console.error(`No se pudo subir un pedazo de grabación (pantalla ${screenIndex}):`, err.message);
    window.pulso.logIssue?.("recording-upload", `pantalla ${screenIndex}: ${err.message}`);
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

// Corta el pedazo actual de UNA sesión y espera a que termine de subirse. recorder.stop() es
// asincrónico — el 'onstop' (que dispara la subida) no corre en el momento de llamarlo, así que
// hay que esperarlo de verdad antes de seguir.
async function flushSession(session) {
  if (!session.recorder || session.recorder.state !== "recording") return;
  const previousOnStop = session.recorder.onstop;
  const stopped = new Promise((resolve) => {
    session.recorder.onstop = async (ev) => {
      await previousOnStop?.(ev); // esperar a que termine de verdad — incluye el arreglo de duración, que es asincrónico
      resolve();
    };
  });
  session.recorder.stop();
  await stopped;
  if (session.pendingUpload) {
    await session.pendingUpload.catch(() => {});
  }
}

function stopSessionTracks(session) {
  if (session.stream) { session.stream.getTracks().forEach((t) => t.stop()); session.stream = null; }
  if (session.micStream) { session.micStream.getTracks().forEach((t) => t.stop()); session.micStream = null; }
  if (session.audioContext) { session.audioContext.close().catch(() => {}); session.audioContext = null; }
}

// Corta la grabación de verdad — se usa al terminar la jornada, al marcar 10-31 (break), o al
// cerrarse la app. Espera a que cada pantalla termine de procesar y subir su pedazo pendiente
// ANTES de cortar el flujo de video — cortarlo en seco mientras 'onstop' todavía está
// procesando (el arreglo de duración, armar el blob) es lo que causaba comportamiento raro.
async function stopScreenRecording() {
  if (!recActive || recSessions.length === 0) return;
  recActive = false; // evita que arranque un pedazo nuevo despues de este stop
  clearInterval(priorityUpdateTimer);
  for (const session of recSessions) clearTimeout(session.chunkTimer);
  await Promise.all(recSessions.map((session) => flushSession(session)));
  for (const session of recSessions) stopSessionTracks(session);
  recSessions = [];
}

// Mismo mecanismo — nombre aparte porque se llama específicamente cuando la app está por
// cerrarse (botón X, o "Salir" desde la bandeja), para que quede claro en ese punto del código.
// No hay forma de cubrir un corte de luz o un apagado forzado de la compu — eso es inevitable
// con cualquier software — pero un cierre normal de la app ya no debería perder nada.
async function flushRecordingBeforeClose() {
  await stopScreenRecording();
}
