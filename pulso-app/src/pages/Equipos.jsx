import { useMemo, useState } from "react";
import { Plus, Trash2, X as XIcon } from "lucide-react";
import { COLORS, realtimeGroupFor } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, StatusDot, ProductivityRing, StateMessage } from "../components/ui";
import LiveGrid, { LiveFilterChips } from "../components/LiveGrid";

export default function Equipos() {
  const { data: teams, loading: loadingTeams, error: errorTeams, refetch: refetchTeams } = useApi("/teams/full");
  const { data: employees, loading: loadingEmployees, error: errorEmployees, refetch: refetchEmployees } = useApi("/employees");

  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [openTeamId, setOpenTeamId] = useState(null);
  const [liveFilter, setLiveFilter] = useState("todos");

  const loading = loadingTeams || loadingEmployees;
  const error = errorTeams || errorEmployees;

  const openTeam = (teams || []).find((t) => t.id === openTeamId) || null;

  const openTeamMembers = useMemo(() => {
    if (!openTeam || !employees) return [];
    const members = employees.filter((e) => e.teamId === openTeam.id);
    if (liveFilter === "todos") return members;
    return members.filter((e) => realtimeGroupFor(e.status).id === liveFilter);
  }, [openTeam, employees, liveFilter]);

  function refetchAll() {
    refetchTeams();
    refetchEmployees();
  }

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      await api.post("/teams", { name: newTeamName.trim() });
      setNewTeamName("");
      refetchAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteTeam(team) {
    if (!confirm(`¿Eliminar el equipo "${team.name}"? Los empleados que estén ahí quedan sin equipo asignado.`)) return;
    try {
      await api.del(`/teams/${team.id}`);
      if (openTeamId === team.id) setOpenTeamId(null);
      refetchAll();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetchAll} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
            placeholder="Nombre del equipo nuevo"
            style={{
              flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
            }}
          />
          <button
            onClick={createTeam}
            disabled={creating}
            className="chip-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none",
              background: COLORS.brand, color: "#fff", fontSize: 13, cursor: creating ? "default" : "pointer", opacity: creating ? 0.7 : 1,
            }}
          >
            <Plus size={14} /> Crear equipo
          </button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }}>
        {(teams || []).map((team) => {
          const members = (employees || []).filter((e) => e.teamId === team.id);
          const avgProd = members.length ? Math.round(members.reduce((s, m) => s + m.productivity, 0) / members.length) : 0;
          const activos = members.filter((m) => m.status === "activo").length;
          const isOpen = openTeamId === team.id;
          return (
            <Card key={team.id} style={{ cursor: "pointer", border: isOpen ? `1px solid ${COLORS.brand}` : undefined }}>
              <div onClick={() => setOpenTeamId(isOpen ? null : team.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="pulso-display" style={{ fontSize: 16, fontWeight: 600 }}>{team.name}</div>
                  <div style={{ fontSize: 12.5, color: COLORS.textTertiary, marginTop: 3 }}>
                    {members.length} integrantes · {activos} activos
                  </div>
                </div>
                <ProductivityRing value={avgProd} size={44} />
              </div>
              <div onClick={() => setOpenTeamId(isOpen ? null : team.id)} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {members.length === 0 ? (
                  <span style={{ fontSize: 12, color: COLORS.textTertiary }}>Todavía no tiene empleados asignados.</span>
                ) : (
                  members.slice(0, 4).map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StatusDot status={m.status} />
                        <span style={{ fontSize: 12.5 }}>{m.name}</span>
                      </div>
                      <span className="pulso-mono" style={{ fontSize: 12, color: COLORS.textTertiary }}>{m.productivity}%</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={() => setOpenTeamId(isOpen ? null : team.id)}
                  style={{ background: "none", border: "none", color: COLORS.brand, fontSize: 12, cursor: "pointer", padding: 0 }}
                >
                  {isOpen ? "Ocultar vista en vivo" : "Ver en vivo"}
                </button>
                <button
                  onClick={() => deleteTeam(team)}
                  title="Eliminar equipo"
                  style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.critical, display: "flex" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          );
        })}
        {(teams || []).length === 0 && (
          <span style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Todavía no creaste ningún equipo.</span>
        )}
      </div>

      {openTeam && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div className="pulso-display" style={{ fontSize: 15, fontWeight: 600 }}>Vista en vivo — {openTeam.name}</div>
            <button onClick={() => setOpenTeamId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textTertiary, display: "flex" }}>
              <XIcon size={16} />
            </button>
          </div>
          <LiveFilterChips value={liveFilter} onChange={setLiveFilter} />
          <LiveGrid employees={openTeamMembers} />
        </Card>
      )}
    </div>
  );
}
