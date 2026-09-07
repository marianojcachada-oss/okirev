import { useMemo, useState } from "react";
import { Monitor } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, Th, Td, StateMessage } from "../components/ui";

const CATEGORIES = [
  { id: "Productiva", label: "Productiva", color: COLORS.live },
  { id: "Neutral", label: "Neutral", color: COLORS.brand },
  { id: "Improductiva", label: "Improductiva", color: COLORS.critical },
];

function CategoryButtons({ current, onChange, busy }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      {CATEGORIES.map((c) => {
        const isActive = current === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            disabled={busy}
            className="chip-btn"
            style={{
              padding: "5px 11px", borderRadius: 20, fontSize: 12, cursor: busy ? "default" : "pointer",
              border: `1px solid ${isActive ? c.color : COLORS.border}`,
              background: isActive ? `${c.color}1A` : "transparent",
              color: isActive ? c.color : COLORS.textSecondary,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Catalogo() {
  const [filter, setFilter] = useState("unclassified");
  const { data: catalog, loading, error, refetch } = useApi(`/catalog?filter=${filter}`);
  const [busyLabel, setBusyLabel] = useState(null);

  const sorted = useMemo(() => {
    if (!catalog) return [];
    return catalog.slice().sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
  }, [catalog]);

  async function setCategory(appLabel, category) {
    setBusyLabel(appLabel);
    try {
      await api.put(`/catalog/${encodeURIComponent(appLabel)}`, { category });
      refetch();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyLabel(null);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: "0 0 14px" }}>
          Cada aplicación y sitio que detecta la app de escritorio aparece acá <strong>una sola vez</strong>.
          Clasificalo como Productiva, Neutral o Improductiva y esa clasificación se aplica
          automáticamente a partir de ahora — no hace falta tocar nada en la computadora del operador.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "unclassified", label: "Sin clasificar" },
            { id: "all", label: "Todas" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="chip-btn"
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${filter === f.id ? COLORS.brand : COLORS.border}`,
                background: filter === f.id ? "rgba(108,123,255,0.14)" : "transparent",
                color: filter === f.id ? COLORS.textPrimary : COLORS.textSecondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Aplicación / sitio</Th>
              <Th>Detectado por primera vez</Th>
              <Th align="right">Clasificación</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.appLabel} className="row-hover">
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Monitor size={13} color={COLORS.textTertiary} />
                    <span style={{ wordBreak: "break-word" }}>{c.appLabel}</span>
                  </div>
                </Td>
                <Td mono>{new Date(c.firstSeenAt).toLocaleDateString("es-AR", { timeZone: "America/New_York" })}</Td>
                <Td align="right">
                  <CategoryButtons
                    current={c.category === "sin_clasificar" ? null : c.category}
                    onChange={(cat) => setCategory(c.appLabel, cat)}
                    busy={busyLabel === c.appLabel}
                  />
                </Td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <Td colSpan={3}>
                  <span style={{ color: COLORS.textTertiary }}>
                    {filter === "unclassified" ? "No hay nada pendiente de clasificar." : "Todavía no se detectó ninguna aplicación."}
                  </span>
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
