import { useState, useRef } from "react";
import { Play, Pause, RotateCcw, X, Monitor } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, SectionHeading, StateMessage } from "../components/ui";
import { atlantaToday } from "../utils/dateRanges";
import { formatDuration } from "../utils/duration";

function fmtHMShort(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtRange(startedAt, endedAt) {
  if (!endedAt) return `${fmtHMShort(startedAt)} — en curso`;
  return `${fmtHMShort(startedAt)} - ${fmtHMShort(endedAt)}`;
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Agrupa por momento (inicio+fin) en vez de por pantalla — cada franja de tiempo junta las
// grabaciones de todas las pantallas de ese operador en ese rango, para poder reproducirlas
// Agrupa por momento en vez de por pantalla — cada franja de tiempo junta las grabaciones de
// todas las pantallas de ese operador en ese rango, para poder reproducirlas juntas y
// sincronizadas (combinar recién al momento de VER, no de grabar). Cada pantalla sube su pedazo
// en un instante levemente distinto (red, tiempo de codificación) — por eso se agrupa por
// cercanía real en el tiempo (un margen bien por debajo de la duración de un pedazo, que suele
// ser de varios minutos), no por una grilla fija de minutos, que falla justo en el límite entre
// un minuto y el siguiente.
const SLOT_GROUP_TOLERANCE_MS = 90 * 1000;

function groupBySlot(recordings) {
  const sorted = [...recordings].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  const groups = [];
  for (const r of sorted) {
    const current = groups[groups.length - 1];
    if (current && new Date(r.startedAt) - new Date(current[0].startedAt) <= SLOT_GROUP_TOLERANCE_MS) {
      current.push(r);
    } else {
      groups.push([r]);
    }
  }
  return groups.map((group) => group.sort((a, b) => (a.screenIndex ?? 0) - (b.screenIndex ?? 0)));
}

// Layout pedido: 1 pantalla → completa, 2 → lado a lado, 3 → tres columnas, 4 → grilla 2x2.
function gridStyle(count) {
  if (count <= 1) return { gridTemplateColumns: "1fr" };
  if (count === 2) return { gridTemplateColumns: "1fr 1fr" };
  if (count === 3) return { gridTemplateColumns: "1fr 1fr 1fr" };
  return { gridTemplateColumns: "1fr 1fr" }; // 4 o más: grilla 2x2 (se van acomodando de a 2 por fila)
}

export default function Grabaciones() {
  const { data: employees } = useApi("/employees");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(atlantaToday());
  const [playingSlot, setPlayingSlot] = useState(null); // [{ id, screenIndex, url }, ...]
  const [loadingSlotKey, setLoadingSlotKey] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRefs = useRef([]);

  const { data: recordings, loading, error, refetch } = useApi(
    employeeId ? `/recordings?employeeId=${employeeId}&date=${date}` : null
  );

  const slots = recordings ? groupBySlot(recordings) : [];
  const screenCount = recordings ? new Set(recordings.map((r) => r.screenIndex ?? 0)).size : 0;

  async function playSlot(slotGroup) {
    const slotKey = `${slotGroup[0].startedAt}|${slotGroup[0].endedAt}`;
    setLoadingSlotKey(slotKey);
    try {
      const withUrls = await Promise.all(
        slotGroup.map(async (r) => {
          const res = await api.get(`/recordings/${r.id}/playback-url`);
          return { ...r, url: res.url };
        })
      );
      videoRefs.current = [];
      setPlayingSlot(withUrls);
      setIsPlaying(true);
    } catch (err) {
      alert(err.message);
      refetch(); // si alguna ya no existe, el servidor limpió esa fila sola — refrescamos la lista
    } finally {
      setLoadingSlotKey(null);
    }
  }

  function playAll() {
    videoRefs.current.forEach((v) => v?.play().catch(() => {}));
    setIsPlaying(true);
  }
  function pauseAll() {
    videoRefs.current.forEach((v) => v?.pause());
    setIsPlaying(false);
  }
  function restartAll() {
    videoRefs.current.forEach((v) => { if (v) v.currentTime = 0; });
    playAll();
  }

  const selectStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Empleado:</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={selectStyle}>
            <option value="">Elegí un empleado…</option>
            {(employees || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary, marginLeft: 8 }}>Día:</span>
          <input type="date" value={date} max={atlantaToday()} onChange={(e) => setDate(e.target.value)} style={selectStyle} />
          {employeeId && recordings && recordings.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: COLORS.textTertiary, marginLeft: "auto" }}>
              <Monitor size={13} /> {screenCount} {screenCount === 1 ? "pantalla detectada" : "pantallas detectadas"}
            </span>
          )}
        </div>
      </Card>

      {!employeeId ? (
        <Card>
          <p style={{ color: COLORS.textTertiary, fontSize: 13 }}>Elegí un empleado y un día para ver sus grabaciones.</p>
        </Card>
      ) : loading || error || !recordings ? (
        <StateMessage loading={loading} error={error} onRetry={refetch} />
      ) : slots.length === 0 ? (
        <Card>
          <SectionHeading>Pedazos grabados</SectionHeading>
          <p style={{ color: COLORS.textTertiary, fontSize: 13, marginTop: 8 }}>Sin grabaciones para ese día.</p>
        </Card>
      ) : (
        <Card>
          <SectionHeading>Pedazos grabados</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {slots.map((slotGroup) => {
              const first = slotGroup[0];
              const slotKey = `${first.startedAt}|${first.endedAt}`;
              return (
                <div
                  key={slotKey}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: COLORS.bg, borderRadius: 8 }}
                >
                  <button
                    onClick={() => playSlot(slotGroup)}
                    disabled={loadingSlotKey === slotKey}
                    title="Reproducir"
                    style={{
                      position: "relative", display: "flex", gap: 3, flexShrink: 0, cursor: "pointer", border: "none", padding: 0, background: "none",
                      opacity: loadingSlotKey === slotKey ? 0.6 : 1,
                    }}
                  >
                    {slotGroup.map((r) => (
                      <span
                        key={r.id}
                        style={{
                          position: "relative", width: slotGroup.length > 1 ? 40 : 64, height: 36, borderRadius: 6, overflow: "hidden",
                          background: r.thumbnail ? `url(${r.thumbnail}) center/cover` : COLORS.surfaceHover, flexShrink: 0,
                        }}
                      >
                        {slotGroup.length > 1 && (
                          <span style={{
                            position: "absolute", bottom: 1, left: 2, fontSize: 9, color: "#fff",
                            textShadow: "0 0 3px rgba(0,0,0,0.9)", fontWeight: 600,
                          }}>
                            {(r.screenIndex ?? 0) + 1}
                          </span>
                        )}
                      </span>
                    ))}
                    <span
                      style={{
                        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                        display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(0,0,0,0.55)", color: "#fff", pointerEvents: "none",
                      }}
                    >
                      <Play size={11} fill="currentColor" />
                    </span>
                  </button>
                  <span className="pulso-mono" style={{ fontSize: 13, minWidth: 110 }}>{fmtRange(first.startedAt, first.endedAt)}</span>
                  <span style={{ fontSize: 12, color: COLORS.textTertiary }}>
                    {first.durationSeconds ? formatDuration(first.durationSeconds) : "—"}
                  </span>
                  {slotGroup.length > 1 && (
                    <span style={{ fontSize: 11.5, color: COLORS.brand, display: "flex", alignItems: "center", gap: 4 }}>
                      <Monitor size={12} /> {slotGroup.length} pantallas
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: COLORS.textTertiary, marginLeft: "auto" }}>
                    {fmtSize(slotGroup.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0))}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {playingSlot && (
        <div
          onClick={() => { pauseAll(); setPlayingSlot(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, borderRadius: 12, padding: 16, maxWidth: "92vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: COLORS.textPrimary }}>
                Pedazo de las {fmtHMShort(playingSlot[0].startedAt)}
                {playingSlot.length > 1 && ` — ${playingSlot.length} pantallas, sincronizadas`}
              </span>
              <button
                onClick={() => { pauseAll(); setPlayingSlot(null); }}
                style={{ background: "none", border: "none", color: COLORS.textTertiary, cursor: "pointer", display: "flex" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 8, ...gridStyle(playingSlot.length), maxWidth: "85vw", maxHeight: "65vh" }}>
              {playingSlot.map((r, i) => (
                <div key={r.id} style={{ position: "relative" }}>
                  {playingSlot.length > 1 && (
                    <span style={{
                      position: "absolute", top: 6, left: 6, zIndex: 1, background: "rgba(0,0,0,0.6)", color: "#fff",
                      fontSize: 11, padding: "2px 7px", borderRadius: 5,
                    }}>
                      Pantalla {(r.screenIndex ?? 0) + 1}
                    </span>
                  )}
                  <video
                    ref={(el) => { videoRefs.current[i] = el; }}
                    src={r.url}
                    autoPlay
                    muted={i > 0}
                    onEnded={() => setIsPlaying(false)}
                    style={{ width: "100%", height: "100%", borderRadius: 8, display: "block", background: "#000" }}
                  />
                </div>
              ))}
            </div>

            {playingSlot.length > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => (isPlaying ? pauseAll() : playAll())}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, background: COLORS.brand, color: "#fff", border: "none",
                    borderRadius: 20, padding: "7px 16px", fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                  {isPlaying ? "Pausar todas" : "Reproducir todas"}
                </button>
                <button
                  onClick={restartAll}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, background: "transparent", color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "7px 16px", fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  <RotateCcw size={13} /> Reiniciar sincronía
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
