import { useMemo, useState } from "react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, SeverityPill, Th, Td, StateMessage } from "../components/ui";

const FILTERS = [
  { id: "abiertas", label: "Abiertas" },
  { id: "revisadas", label: "Revisadas" },
  { id: "todas", label: "Todas" },
];

// "08/10/2026 14:27" en hora de Atlanta (ET), igual que el reloj del panel. Si por algún
// motivo la alerta no trae fecha completa (alertas muy viejas), se muestra solo la hora guardada.
function formatAlertDateTime(a) {
  if (!a.createdAt) return a.time || "—";
  const d = new Date(a.createdAt);
  if (Number.isNaN(d.getTime())) return a.time || "—";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.day}/${parts.month}/${parts.year} ${hh}:${parts.minute}`;
}

export default function Alertas() {
  const [filter, setFilter] = useState("abiertas");
  const { data: alerts, loading, error, refetch } = useApi("/alerts");
  const [updatingId, setUpdatingId] = useState(null);

  const filtered = useMemo(() => {
    if (!alerts) return [];
    if (filter === "todas") return alerts;
    return alerts.filter((a) => (filter === "abiertas" ? a.status === "abierta" : a.status === "revisada"));
  }, [alerts, filter]);

  async function markReviewed(alert) {
    setUpdatingId(alert.id);
    try {
      await api.patch(`/alerts/${alert.id}`, { status: "revisada" });
      refetch();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="chip-btn"
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 12.5,
              cursor: "pointer",
              border: `1px solid ${filter === f.id ? COLORS.brand : COLORS.border}`,
              background: filter === f.id ? "rgba(108,123,255,0.14)" : "transparent",
              color: filter === f.id ? COLORS.textPrimary : COLORS.textSecondary,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Severidad</Th>
              <Th>Tipo</Th>
              <Th>Operador</Th>
              <Th>Detalle</Th>
              <Th align="right">Fecha y hora</Th>
              <Th align="right">Acción</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="row-hover">
                <Td>
                  <SeverityPill severity={a.severity} />
                </Td>
                <Td>{a.type}</Td>
                <Td>{a.employee}</Td>
                <Td>
                  <span style={{ color: COLORS.textSecondary }}>{a.detail}</span>
                </Td>
                <Td align="right" mono>
                  {formatAlertDateTime(a)}
                </Td>
                <Td align="right">
                  {a.status === "abierta" ? (
                    <button
                      onClick={() => markReviewed(a)}
                      disabled={updatingId === a.id}
                      className="chip-btn"
                      style={{
                        padding: "5px 11px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surfaceHover,
                        color: COLORS.textPrimary,
                        fontSize: 12,
                        cursor: updatingId === a.id ? "default" : "pointer",
                        opacity: updatingId === a.id ? 0.6 : 1,
                      }}
                    >
                      {updatingId === a.id ? "Guardando…" : "Marcar revisada"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: COLORS.textTertiary }}>Revisada</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
