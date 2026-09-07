import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, ProgressBar, StateMessage } from "../components/ui";

export default function Proyectos() {
  const { data: projects, loading, error, refetch } = useApi("/projects");

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }}>
      {projects.map((p) => (
        <Card key={p.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14.5 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 3 }}>{p.team}</div>
            </div>
            <span
              style={{
                fontSize: 12,
                padding: "3px 9px",
                borderRadius: 6,
                color: p.state === "En riesgo" ? COLORS.critical : p.state === "Completado" ? COLORS.live : COLORS.brand,
                background:
                  p.state === "En riesgo"
                    ? `${COLORS.critical}1A`
                    : p.state === "Completado"
                    ? `${COLORS.live}1A`
                    : `${COLORS.brand}1A`,
              }}
            >
              {p.state}
            </span>
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 }}>
              <span>Avance</span>
              <span className="pulso-mono">{p.progress}%</span>
            </div>
            <ProgressBar value={p.progress} color={p.state === "En riesgo" ? COLORS.warn : COLORS.brand} />
          </div>
          <div className="pulso-mono" style={{ marginTop: 12, fontSize: 12, color: COLORS.textTertiary }}>
            {p.hoursLogged} h de {p.hoursBudget} h presupuestadas
          </div>
        </Card>
      ))}
    </div>
  );
}
