import { useState } from "react";
import { Play, X } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, SectionHeading, StateMessage } from "../components/ui";
import { atlantaToday } from "../utils/dateRanges";
import { formatDuration } from "../utils/duration";

function fmtHM(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Grabaciones() {
  const { data: employees } = useApi("/employees");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(atlantaToday());
  const [playing, setPlaying] = useState(null); // { url, label }
  const [loadingId, setLoadingId] = useState(null);

  const { data: recordings, loading, error, refetch } = useApi(
    employeeId ? `/recordings?employeeId=${employeeId}&date=${date}` : null
  );

  async function play(id, label) {
    setLoadingId(id);
    try {
      const res = await api.get(`/recordings/${id}/playback-url`);
      setPlaying({ url: res.url, label });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingId(null);
    }
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
        </div>
      </Card>

      {!employeeId ? (
        <Card>
          <p style={{ color: COLORS.textTertiary, fontSize: 13 }}>Elegí un empleado y un día para ver sus grabaciones.</p>
        </Card>
      ) : loading || error || !recordings ? (
        <StateMessage loading={loading} error={error} onRetry={refetch} />
      ) : (
        <Card>
          <SectionHeading>Pedazos grabados</SectionHeading>
          {recordings.length === 0 ? (
            <p style={{ color: COLORS.textTertiary, fontSize: 13, marginTop: 8 }}>Sin grabaciones para ese día.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {recordings.map((r) => (
                <div
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: COLORS.bg, borderRadius: 8 }}
                >
                  <button
                    onClick={() => play(r.id, fmtHM(r.startedAt))}
                    disabled={loadingId === r.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%",
                      border: "none", background: COLORS.brand, color: "#fff", cursor: "pointer", flexShrink: 0,
                      opacity: loadingId === r.id ? 0.6 : 1,
                    }}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                  <span className="pulso-mono" style={{ fontSize: 13, minWidth: 74 }}>{fmtHM(r.startedAt)}</span>
                  <span style={{ fontSize: 12, color: COLORS.textTertiary }}>
                    {r.durationSeconds ? formatDuration(r.durationSeconds) : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.textTertiary, marginLeft: "auto" }}>{fmtSize(r.fileSizeBytes)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {playing && (
        <div
          onClick={() => setPlaying(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, borderRadius: 12, padding: 16, maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: COLORS.textPrimary }}>Pedazo de las {playing.label}</span>
              <button
                onClick={() => setPlaying(null)}
                style={{ background: "none", border: "none", color: COLORS.textTertiary, cursor: "pointer", display: "flex" }}
              >
                <X size={18} />
              </button>
            </div>
            <video src={playing.url} controls autoPlay style={{ maxWidth: "80vw", maxHeight: "70vh", borderRadius: 8, display: "block" }} />
          </div>
        </div>
      )}
    </div>
  );
}
