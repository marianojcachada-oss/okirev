import { useState } from "react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, SectionHeading, StateMessage } from "../components/ui";
import { DATE_PRESETS, computeRange, atlantaToday } from "../utils/dateRanges";
import { formatDuration } from "../utils/duration";
import { parseAppLabel, AppIcon } from "../utils/appDisplay";

const CATEGORY_COLORS = { Productiva: COLORS.live, Neutral: COLORS.brand, Improductiva: COLORS.critical };

function SiteRow({ site }) {
  const { displayName, hostname } = parseAppLabel(site.name);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 4px",
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <AppIcon hostname={hostname} />
      <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
      <span style={{ fontSize: 11.5, color: CATEGORY_COLORS[site.category] || COLORS.textTertiary, flexShrink: 0, width: 90 }}>
        {site.category}
      </span>
      <span className="pulso-mono" style={{ fontSize: 12.5, color: COLORS.textSecondary, flexShrink: 0, minWidth: 70, textAlign: "right" }}>
        {formatDuration(site.seconds)}
      </span>
    </div>
  );
}

export default function InformesWeb() {
  const [preset, setPreset] = useState("todo-el-anio");
  const [isCustom, setIsCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(atlantaToday());
  const [customTo, setCustomTo] = useState(atlantaToday());

  const { from, to } = isCustom ? { from: customFrom, to: customTo } : computeRange(preset);

  const { data: webReport, loading, error, refetch } = useApi(`/reports/web?from=${from}&to=${to}`);

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
        <SectionHeading>Sitios y herramientas web</SectionHeading>
        <p style={{ fontSize: 12, color: COLORS.textTertiary, margin: "-6px 0 12px" }}>
          Solo actividad con una URL real detectada (necesita la extensión del navegador instalada) — apps de escritorio sin sitio no aparecen acá, esas están en Aplicaciones.
        </p>
        <div>
          {webReport.map((w, i) => (
            <SiteRow key={i} site={w} />
          ))}
          {webReport.length === 0 && (
            <p style={{ color: COLORS.textTertiary, fontSize: 13, padding: "8px 4px" }}>Sin sitios web detectados en este rango.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
