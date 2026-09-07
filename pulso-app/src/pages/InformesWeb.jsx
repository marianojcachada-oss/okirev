import { MessageSquare, Globe } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, Th, Td, StateMessage } from "../components/ui";

export default function InformesWeb() {
  const { data: webReport, loading, error, refetch } = useApi("/reports/web");

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <Card style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Sitio / herramienta</Th>
            <Th>Categoría</Th>
            <Th align="right">Horas esta semana</Th>
          </tr>
        </thead>
        <tbody>
          {webReport.map((w, i) => (
            <tr key={i} className="row-hover">
              <Td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {w.category === "Comunicación" ? (
                    <MessageSquare size={14} color={COLORS.textTertiary} />
                  ) : (
                    <Globe size={14} color={COLORS.textTertiary} />
                  )}
                  {w.name}
                </div>
              </Td>
              <Td>
                <span style={{ fontSize: 12.5, color: w.category === "No autorizada" ? COLORS.critical : COLORS.textSecondary }}>
                  {w.category}
                </span>
              </Td>
              <Td align="right" mono>
                {w.hours} h
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
