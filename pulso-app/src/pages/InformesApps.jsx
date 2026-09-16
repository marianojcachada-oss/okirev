import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, SectionHeading, Th, Td, StateMessage } from "../components/ui";
import { DATE_PRESETS, computeRange, atlantaToday } from "../utils/dateRanges";

export default function InformesApps() {
  const [preset, setPreset] = useState("todo-el-anio");
  const [isCustom, setIsCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(atlantaToday());
  const [customTo, setCustomTo] = useState(atlantaToday());

  const { from, to } = isCustom ? { from: customFrom, to: customTo } : computeRange(preset);
  const activePreset = DATE_PRESETS.find((p) => p.id === preset);

  const { data: appReport, loading, error, refetch } = useApi(`/reports/apps?from=${from}&to=${to}`);

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPreset(p.id); setIsCustom(false); }}
              className="chip-btn"
              style={{
                padding: "6px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${!isCustom && preset === p.id ? COLORS.brand : COLORS.border}`,
                background: !isCustom && preset === p.id ? "rgba(108,123,255,0.14)" : "transparent",
                color: !isCustom && preset === p.id ? COLORS.textPrimary : COLORS.textSecondary,
              }}
            >
              {p.label}
            </button>
          ))}
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary, marginLeft: 4 }}>o un rango:</span>
          <input type="date" value={customFrom} max={atlantaToday()} onChange={(e) => { setCustomFrom(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }} />
          <span style={{ color: COLORS.textTertiary, fontSize: 12.5 }}>hasta</span>
          <input type="date" value={customTo} max={atlantaToday()} onChange={(e) => { setCustomTo(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }} />
        </div>
      </Card>

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
              <Th align="right">Horas · {isCustom ? "rango elegido" : activePreset?.label.toLowerCase()}</Th>
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
            {appReport.length === 0 && (
              <tr><Td colSpan={3}><span style={{ color: COLORS.textTertiary }}>Sin actividad productiva/improductiva en este rango.</span></Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
