import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, SectionHeading, Th, Td, StateMessage } from "../components/ui";

export default function InformesApps() {
  const { data: appReport, loading, error, refetch } = useApi("/reports/apps");

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <SectionHeading>Horas por aplicación</SectionHeading>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={appReport} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={COLORS.border} horizontal={false} />
              <XAxis type="number" stroke={COLORS.textTertiary} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke={COLORS.textTertiary} fontSize={11.5} tickLine={false} axisLine={false} width={140} />
              <Tooltip contentStyle={{ background: COLORS.surfaceHover, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {appReport.map((entry, i) => (
                  <Cell key={i} fill={entry.category === "Productiva" ? COLORS.live : COLORS.critical} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Aplicación</Th>
              <Th>Categoría</Th>
              <Th align="right">Horas esta semana</Th>
            </tr>
          </thead>
          <tbody>
            {appReport.map((a, i) => (
              <tr key={i} className="row-hover">
                <Td>{a.name}</Td>
                <Td>
                  <span style={{ fontSize: 12.5, color: a.category === "Productiva" ? COLORS.live : COLORS.critical }}>
                    {a.category}
                  </span>
                </Td>
                <Td align="right" mono>
                  {a.hours} h
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
