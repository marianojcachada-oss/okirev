import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, SectionHeading, StateMessage } from "../components/ui";
import { DATE_PRESETS, computeRange, atlantaToday } from "../utils/dateRanges";
import { formatDuration } from "../utils/duration";
import { parseAppLabel, AppIcon } from "../utils/appDisplay";

const CATEGORY_COLORS = { Productiva: COLORS.live, Neutral: COLORS.brand, Improductiva: COLORS.critical };

function AppRow({ app }) {
  const { displayName, hostname } = parseAppLabel(app.name);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 4px",
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <AppIcon hostname={hostname} />
      <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
      <span style={{ fontSize: 11.5, color: CATEGORY_COLORS[app.category] || COLORS.textTertiary, flexShrink: 0, width: 90 }}>
        {app.category}
      </span>
      <span className="pulso-mono" style={{ fontSize: 12.5, color: COLORS.textSecondary, flexShrink: 0, minWidth: 70, textAlign: "right" }}>
        {formatDuration(app.seconds)}
      </span>
    </div>
  );
}

export default function InformesApps() {
  const [preset, setPreset] = useState("todo-el-anio");
  const [isCustom, setIsCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(atlantaToday());
  const [customTo, setCustomTo] = useState(atlantaToday());

  const { from, to } = isCustom ? { from: customFrom, to: customTo } : computeRange(preset);

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
              <YAxis type="category" dataKey="name" stroke={COLORS.textTertiary} fontSize={11.5} tickLine={false} axisLine={false} width={140}
                tickFormatter={(v) => parseAppLabel(v).displayName} />
              <Tooltip
                contentStyle={{ background: COLORS.surfaceHover, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => parseAppLabel(v).displayName}
              />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {appReport.map((entry, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[entry.category] || COLORS.textTertiary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <SectionHeading>Todas las aplicaciones y sitios web</SectionHeading>
        <div>
          {appReport.map((a, i) => (
            <AppRow key={i} app={a} />
          ))}
          {appReport.length === 0 && (
            <p style={{ color: COLORS.textTertiary, fontSize: 13, padding: "8px 4px" }}>Sin actividad registrada en este rango.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
