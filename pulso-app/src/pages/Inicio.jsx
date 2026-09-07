import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { Card, StatCard, SeverityPill, ProgressBar, SectionHeading, StateMessage } from "../components/ui";

export default function Inicio() {
  const navigate = useNavigate();
  const { data: employees, loading: loadingEmployees, error: errorEmployees, refetch: refetchEmployees } = useApi("/employees");
  const { data: alerts, loading: loadingAlerts, error: errorAlerts } = useApi("/alerts");
  const { data: activityChart, loading: loadingChart, error: errorChart } = useApi("/reports/activity-chart");
  const { data: teams, loading: loadingTeams, error: errorTeams } = useApi("/teams");

  const loading = loadingEmployees || loadingAlerts || loadingChart || loadingTeams;
  const error = errorEmployees || errorAlerts || errorChart || errorTeams;

  const activeCount = useMemo(() => (employees ? employees.filter((e) => e.status === "activo").length : 0), [employees]);
  const pausaCount = useMemo(() => (employees ? employees.filter((e) => e.status === "pausa").length : 0), [employees]);
  const ausenteCount = useMemo(() => (employees ? employees.filter((e) => e.status === "ausente").length : 0), [employees]);
  const openAlerts = useMemo(() => (alerts ? alerts.filter((a) => a.status === "abierta").length : 0), [alerts]);
  const totalHoras = useMemo(
    () => (employees ? employees.reduce((s, e) => s + e.hoursToday, 0).toFixed(0) : "0"),
    [employees]
  );

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetchEmployees} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Card>
          <div style={{ fontSize: 13, color: COLORS.textSecondary }}>Operadores activos ahora</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
            <span className="pulso-display" style={{ fontSize: 52, fontWeight: 600, lineHeight: 1 }}>
              {activeCount}
            </span>
            <span style={{ fontSize: 14, color: COLORS.textTertiary }}>de {employees.length} en el roster de hoy</span>
          </div>
          <div style={{ marginTop: 22, height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.live} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.live} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="hora" stroke={COLORS.textTertiary} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={COLORS.textTertiary} fontSize={11} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ background: COLORS.surfaceHover, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="productivo" stroke={COLORS.live} fill="url(#prodGrad)" strokeWidth={2} name="Productivo %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <SectionHeading>Alertas recientes</SectionHeading>
            <button
              onClick={() => navigate("/alertas")}
              className="chip-btn"
              style={{ background: "none", border: "none", color: COLORS.brand, fontSize: 12.5, cursor: "pointer" }}
            >
              Ver todas
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            {alerts.slice(0, 4).map((a, i) => (
              <div
                key={a.id}
                style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: i < 3 ? `1px solid ${COLORS.border}` : "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <SeverityPill severity={a.severity} />
                  <span className="pulso-mono" style={{ fontSize: 11.5, color: COLORS.textTertiary }}>
                    {a.time}
                  </span>
                </div>
                <span style={{ fontSize: 13 }}>
                  {a.employee} · {a.type}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
        <StatCard label="En pausa" value={pausaCount} sub="operadores en descanso" accent={COLORS.warn} />
        <StatCard label="Ausentes hoy" value={ausenteCount} sub="sin check-in registrado" accent={COLORS.critical} />
        <StatCard label="Alertas abiertas" value={openAlerts} sub="pendientes de revisión" accent={COLORS.critical} />
        <StatCard label="Horas trackeadas" value={`${totalHoras} h`} sub="acumuladas en el turno" />
      </div>

      <Card>
        <SectionHeading>Equipos hoy</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {teams.map((team) => {
            const members = employees.filter((e) => e.team === team);
            const avgProd = members.length ? Math.round(members.reduce((s, m) => s + m.productivity, 0) / members.length) : 0;
            const activos = members.filter((m) => m.status === "activo").length;
            return (
              <div key={team} style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{team}</div>
                <div style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 2 }}>
                  {activos}/{members.length} activos
                </div>
                <div style={{ marginTop: 12 }}>
                  <ProgressBar value={avgProd} color={avgProd >= 80 ? COLORS.live : avgProd >= 60 ? COLORS.warn : COLORS.critical} />
                </div>
                <div className="pulso-mono" style={{ fontSize: 12, marginTop: 6, color: COLORS.textSecondary }}>
                  {avgProd}% productividad prom.
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
