import { useMemo, useState } from "react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, Initials, Th, Td, StateMessage } from "../components/ui";
import { DATE_PRESETS, computeRange, atlantaToday } from "../utils/dateRanges";
import { formatDuration } from "../utils/duration";

const CATEGORY_COLORS = {
  Productiva: COLORS.live,
  Neutral: COLORS.brand,
  Improductiva: COLORS.critical,
  Inactivo: COLORS.textTertiary,
  Break: "#F5A623",
};
const CATEGORY_LABELS = {
  Productiva: "Productiva",
  Neutral: "Neutral",
  Improductiva: "Improductiva",
  Inactivo: "Inactivo",
  Break: "Break (10-31)",
};

const HOUR_MARKS = Array.from({ length: 13 }, (_, i) => i * 2);

function HourAxis() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 200, marginBottom: 6 }}>
      {HOUR_MARKS.map((h) => (
        <span key={h} className="pulso-mono" style={{ fontSize: 10.5, color: COLORS.textTertiary }}>
          {String(h % 24).padStart(2, "0")}h
        </span>
      ))}
    </div>
  );
}

function TimelineRow({ employeeName, segments }) {
  const trackedMinutes = segments.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);
  const utilization = Math.round((trackedMinutes / 1440) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ width: 188, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Initials name={employeeName} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{employeeName}</div>
          <div className="pulso-mono" style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{utilization}% del día</div>
        </div>
      </div>
      <div
        style={{
          position: "relative", flex: 1, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`,
          background: `repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 1px), ${COLORS.border} calc(100%/12 - 1px), ${COLORS.border} calc(100%/12))`,
          overflow: "hidden",
        }}
      >
        {segments.map((s, i) => {
          const left = (s.startMinutes / 1440) * 100;
          const width = Math.max(0.3, ((s.endMinutes - s.startMinutes) / 1440) * 100);
          return (
            <div
              key={i}
              title={`${s.app} — ${CATEGORY_LABELS[s.category] || s.category}`}
              style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: CATEGORY_COLORS[s.category] || COLORS.textTertiary }}
            />
          );
        })}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// Same 24h clock-positioned bar as TimelineRow, but labeled with a date instead of an
// employee — used when a specific operator + a multi-day range are both selected, so each
// day gets its own real timeline (not just a proportional summary bar).
function DayTimelineRow({ date, segments }) {
  const trackedMinutes = segments.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);
  const utilization = Math.round((trackedMinutes / 1440) * 100);
  const d = new Date(`${date}T12:00:00`); // noon to dodge any tz rounding into the wrong day
  const label = `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ width: 188, flexShrink: 0 }}>
        <div style={{ fontSize: 12.5 }}>{label}</div>
        <div className="pulso-mono" style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{utilization}% del día</div>
      </div>
      <div
        style={{
          position: "relative", flex: 1, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`,
          background: `repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 1px), ${COLORS.border} calc(100%/12 - 1px), ${COLORS.border} calc(100%/12))`,
          overflow: "hidden",
        }}
      >
        {segments.map((s, i) => {
          const left = (s.startMinutes / 1440) * 100;
          const width = Math.max(0.3, ((s.endMinutes - s.startMinutes) / 1440) * 100);
          return (
            <div
              key={i}
              title={`${s.app} — ${CATEGORY_LABELS[s.category] || s.category}`}
              style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: CATEGORY_COLORS[s.category] || COLORS.textTertiary }}
            />
          );
        })}
      </div>
    </div>
  );
}

// For multi-day ranges: one proportional stacked bar per employee (Productiva/Neutral/
// Improductiva/Inactivo), since a 24h clock-position timeline doesn't make sense across
// several days.
function RangeBarRow({ name, team, productiveH, neutralH, unproductiveH, inactiveH, breakH }) {
  const total = productiveH + neutralH + unproductiveH + inactiveH + breakH;
  const pct = (h) => (total > 0 ? (h / total) * 100 : 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ width: 188, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Initials name={name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div className="pulso-mono" style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{total.toFixed(1)} h totales</div>
        </div>
      </div>
      <div style={{ flex: 1, height: 22, borderRadius: 6, overflow: "hidden", display: "flex", border: `1px solid ${COLORS.border}` }}>
        {total === 0 ? (
          <div style={{ flex: 1, background: COLORS.border }} />
        ) : (
          <>
            <div style={{ width: `${pct(productiveH)}%`, background: CATEGORY_COLORS.Productiva }} title={`Productiva: ${productiveH}h`} />
            <div style={{ width: `${pct(neutralH)}%`, background: CATEGORY_COLORS.Neutral }} title={`Neutral: ${neutralH}h`} />
            <div style={{ width: `${pct(unproductiveH)}%`, background: CATEGORY_COLORS.Improductiva }} title={`Improductiva: ${unproductiveH}h`} />
            <div style={{ width: `${pct(breakH)}%`, background: CATEGORY_COLORS.Break }} title={`Break: ${breakH}h`} />
            <div style={{ width: `${pct(inactiveH)}%`, background: CATEGORY_COLORS.Inactivo }} title={`Inactivo: ${inactiveH}h`} />
          </>
        )}
      </div>
    </div>
  );
}

export default function Actividades() {
  const today = atlantaToday();
  const [preset, setPreset] = useState("hoy");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [isCustom, setIsCustom] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("todos");

  const { from, to } = isCustom ? { from: customFrom, to: customTo } : computeRange(preset);
  const isSingleDay = from === to;
  const hasEmployeeSelected = selectedEmployeeId !== "todos";

  const { data: employees } = useApi("/employees");
  const timelineApi = useApi(isSingleDay ? `/activities/timeline?date=${from}` : null);
  const summaryApi = useApi(!isSingleDay && !hasEmployeeSelected ? `/employees/summary?from=${from}&to=${to}` : null);
  const timelineByDayApi = useApi(
    !isSingleDay && hasEmployeeSelected ? `/activities/timeline-by-day?employeeId=${selectedEmployeeId}&from=${from}&to=${to}` : null
  );
  const logQuery = hasEmployeeSelected
    ? `/activities?from=${from}&to=${to}&employeeId=${selectedEmployeeId}`
    : `/activities?date=${to}`;
  const { data: rawLog, loading: loadingLog, error: errorLog, refetch: refetchLog } = useApi(logQuery);

  const loading = (isSingleDay ? timelineApi.loading : hasEmployeeSelected ? timelineByDayApi.loading : summaryApi.loading) || loadingLog;
  const error = (isSingleDay ? timelineApi.error : hasEmployeeSelected ? timelineByDayApi.error : summaryApi.error) || errorLog;

  const employeeById = useMemo(() => {
    const map = {};
    (employees || []).forEach((e) => { map[e.id] = e; });
    return map;
  }, [employees]);

  const sortedTimeline = useMemo(() => {
    if (!timelineApi.data) return [];
    const rows = hasEmployeeSelected ? timelineApi.data.filter((r) => r.employeeId === selectedEmployeeId) : timelineApi.data;
    return rows.slice().sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [timelineApi.data, hasEmployeeSelected, selectedEmployeeId]);

  const rangeBars = useMemo(() => {
    if (!summaryApi.data) return [];
    return summaryApi.data
      .map((s) => ({ ...s, employee: employeeById[s.employeeId] }))
      .filter((s) => s.employee)
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [summaryApi.data, employeeById]);

  // Consecutive raw flush events pile up fast (an app switch every few seconds can mean
  // dozens of rows). The detail table is far more readable grouped by employee+app+category
  // with the durations summed, instead of one line per individual event.
  const aggregatedLog = useMemo(() => {
    const map = new Map();
    for (const a of rawLog || []) {
      const key = `${a.employeeId}|${a.app}|${a.category}`;
      const existing = map.get(key);
      if (existing) {
        existing.durationSeconds += a.durationSeconds;
        if (a.occurredAt > existing.lastOccurredAt) existing.lastOccurredAt = a.occurredAt;
      } else {
        map.set(key, { ...a, lastOccurredAt: a.occurredAt });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [rawLog]);

  function selectPreset(id) {
    setPreset(id);
    setIsCustom(false);
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetchLog} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPreset(p.id)}
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Rango personalizado:</span>
          <input type="date" value={customFrom} max={today} onChange={(e) => { setCustomFrom(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }} />
          <span style={{ color: COLORS.textTertiary, fontSize: 12.5 }}>hasta</span>
          <input type="date" value={customTo} max={today} onChange={(e) => { setCustomTo(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }} />

          <span style={{ fontSize: 12.5, color: COLORS.textSecondary, marginLeft: 8 }}>Empleado:</span>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }}
          >
            <option value="todos">Todos los empleados</option>
            {(employees || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.textSecondary }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: CATEGORY_COLORS[key], display: "inline-block" }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        {isSingleDay ? (
          sortedTimeline.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>
              {hasEmployeeSelected ? "Este empleado no tiene actividad registrada este día." : "Nadie tiene actividad registrada este día."}
            </div>
          ) : (
            <>
              <HourAxis />
              {sortedTimeline.map((row) => (
                <TimelineRow key={row.employeeId} employeeName={row.employeeName} segments={row.segments} />
              ))}
            </>
          )
        ) : hasEmployeeSelected ? (
          (timelineByDayApi.data || []).length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>Sin actividad registrada en este rango.</div>
          ) : (
            <>
              <HourAxis />
              {(timelineByDayApi.data || []).map((d) => (
                <DayTimelineRow key={d.date} date={d.date} segments={d.segments} />
              ))}
            </>
          )
        ) : rangeBars.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>Nadie tiene actividad registrada en este rango.</div>
        ) : (
          rangeBars.map((r) => (
            <RangeBarRow
              key={r.employeeId}
              name={r.employee.name}
              team={r.employee.team}
              productiveH={Math.max(0, r.workedHours - r.neutralHours - r.unproductiveHours - r.inactiveHours - r.breakHours)}
              neutralH={r.neutralHours}
              unproductiveH={r.unproductiveHours}
              inactiveH={r.inactiveHours}
              breakH={r.breakHours}
            />
          ))
        )}
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px 0", fontSize: 12.5, color: COLORS.textSecondary }}>
          Detalle ({aggregatedLog.length} aplicaciones distintas, tiempo sumado por app{hasEmployeeSelected ? "" : " · último día del rango"})
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr>
              <Th>Última vez</Th><Th>Operador</Th><Th>Aplicación / sitio</Th><Th>Categoría</Th><Th align="right">Duración total</Th>
            </tr>
          </thead>
          <tbody>
            {aggregatedLog.map((a) => (
              <tr key={`${a.employeeId}-${a.app}-${a.category}`} className="row-hover">
                <Td mono>{new Date(a.lastOccurredAt).toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" })}</Td>
                <Td>{a.employee}</Td>
                <Td>{a.app}</Td>
                <Td><span style={{ fontSize: 12.5, color: CATEGORY_COLORS[a.category] || COLORS.textTertiary }}>{CATEGORY_LABELS[a.category] || a.category}</span></Td>
                <Td align="right" mono>{formatDuration(a.durationSeconds)}</Td>
              </tr>
            ))}
            {aggregatedLog.length === 0 && (
              <tr><Td colSpan={5}><span style={{ color: COLORS.textTertiary }}>Sin eventos.</span></Td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
