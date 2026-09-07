import { useMemo, useState, Fragment } from "react";
import { Search, ChevronRight, ChevronDown, Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, StatusPill, Initials, Th, Td, StateMessage, Modal } from "../components/ui";
import { formatDuration } from "../utils/duration";

function DurationMetric({ seconds, color }) {
  return (
    <span className="pulso-mono" style={{ color: color || COLORS.textPrimary }}>
      {formatDuration(seconds)}
    </span>
  );
}

function PercentMetric({ value, color }) {
  return (
    <span className="pulso-mono" style={{ color: color || COLORS.textPrimary }}>
      {value}%
    </span>
  );
}

const emptyForm = { name: "", teamId: "", role: "", username: "", email: "", roleId: "", trackingConfigId: "", idleThresholdMinutesOverride: "", breakMinutesOverride: "" };

function EmployeeFormModal({ initial, teams, roles, trackingConfigs, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name, teamId: initial.teamId || "", role: initial.role || "", username: initial.username || "",
          email: initial.email || "", roleId: initial.roleId || "", trackingConfigId: initial.trackingConfigId || "",
          idleThresholdMinutesOverride: initial.idleThresholdMinutesOverride ?? "",
          breakMinutesOverride: initial.breakMinutesOverride ?? "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.username.trim()) {
      setError("Nombre y usuario son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.put(`/employees/${initial.id}`, form);
      } else {
        await api.post("/employees", form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, marginTop: 6, boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12.5, color: COLORS.textSecondary };

  return (
    <Modal title={isEdit ? "Editar empleado" : "Agregar empleado"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Nombre completo</label>
          <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej: Sofía Bianchi" />
        </div>
        <div>
          <label style={labelStyle}>Equipo</label>
          <select style={inputStyle} value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
            <option value="">Sin equipo</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Puesto</label>
          <input style={inputStyle} value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Ej: Agente senior" />
        </div>
        <div>
          <label style={labelStyle}>Usuario (para iniciar sesión en la app de escritorio)</label>
          <input style={inputStyle} value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="Ej: sbianchi" />
        </div>
        <div>
          <label style={labelStyle}>Email (opcional, solo de referencia)</label>
          <input style={inputStyle} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Ej: sofia@empresa.com" />
        </div>
        <div>
          <label style={labelStyle}>Rol de acceso al panel (opcional)</label>
          <select style={inputStyle} value={form.roleId} onChange={(e) => set("roleId", e.target.value)}>
            <option value="">Sin acceso al panel (solo app de escritorio)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Grupo de configuración de trackeo</label>
          <select style={inputStyle} value={form.trackingConfigId} onChange={(e) => set("trackingConfigId", e.target.value)}>
            <option value="">Default de la empresa</option>
            {trackingConfigs.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.idleThresholdMinutes} min)</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Umbral de inactividad individual (opcional, anula todo lo anterior)</label>
          <input
            type="number" min="1" style={inputStyle} value={form.idleThresholdMinutesOverride}
            onChange={(e) => set("idleThresholdMinutesOverride", e.target.value)}
            placeholder="Dejalo vacío para no anular nada"
          />
        </div>
        <div>
          <label style={labelStyle}>Minutos de break (10-31) individual (opcional, anula todo lo anterior)</label>
          <input
            type="number" min="1" style={inputStyle} value={form.breakMinutesOverride}
            onChange={(e) => set("breakMinutesOverride", e.target.value)}
            placeholder="Dejalo vacío para no anular nada"
          />
        </div>
        {!isEdit && (
          <p style={{ fontSize: 11.5, color: COLORS.textTertiary, margin: 0 }}>
            Después de crearlo, usá el ícono de llave en la tabla para asignarle una contraseña —
            sin eso no va a poder iniciar sesión en la app de escritorio.
          </p>
        )}
        {error && <div style={{ color: COLORS.critical, fontSize: 12.5 }}>{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="chip-btn"
          style={{
            padding: "10px", borderRadius: 8, border: "none", background: COLORS.brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear empleado"}
        </button>
      </div>
    </Modal>
  );
}

function PasswordModal({ employee, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/employees/${employee.id}/password`, { password });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, marginTop: 6, boxSizing: "border-box",
  };

  return (
    <Modal title={`Contraseña de ${employee.name}`} onClose={onClose} width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: 0 }}>
          Usuario: <span className="pulso-mono">{employee.username}</span>. No hay recuperación
          automática — si la olvida, tenés que asignarle una nueva acá.
        </p>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Contraseña nueva</label>
          <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </div>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Repetir contraseña</label>
          <input type="password" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <div style={{ color: COLORS.critical, fontSize: 12.5 }}>{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="chip-btn"
          style={{
            padding: "10px", borderRadius: 8, border: "none", background: COLORS.brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </Modal>
  );
}

const iconBtnStyle = {
  width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`,
  background: COLORS.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};

export default function Empleados() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [formModal, setFormModal] = useState(null); // null | "create" | employee object
  const [passwordModal, setPasswordModal] = useState(null); // null | employee object

  const { data: employees, loading: loadingEmployees, error: errorEmployees, refetch } = useApi("/employees");
  const { data: summary, loading: loadingSummary, error: errorSummary } = useApi("/employees/summary");
  const { data: attendanceToday, loading: loadingAttendance, error: errorAttendance } = useApi("/attendance/today");
  const { data: teams } = useApi("/teams/full");
  const { data: roles } = useApi("/roles");
  const { data: trackingConfigs } = useApi("/tracking-configs");
  const { data: devices } = useApi("/employees/devices");
  const devicesByEmployee = useMemo(() => {
    const map = {};
    (devices || []).forEach((d) => {
      (map[d.employeeId] = map[d.employeeId] || []).push(d);
    });
    return map;
  }, [devices]);

  const loading = loadingEmployees || loadingSummary || loadingAttendance;
  const error = errorEmployees || errorSummary || errorAttendance;

  const summaryByEmployee = useMemo(() => {
    const map = {};
    (summary || []).forEach((s) => { map[s.employeeId] = s; });
    return map;
  }, [summary]);

  const blocksByEmployee = useMemo(() => {
    const map = {};
    (attendanceToday || []).forEach((b) => {
      (map[b.employeeId] = map[b.employeeId] || []).push(b);
    });
    return map;
  }, [attendanceToday]);

  const filtered = useMemo(() => {
    if (!employees) return [];
    return employees.filter(
      (e) => e.name.toLowerCase().includes(search.toLowerCase()) || (e.team || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search]);

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(e) {
    if (!confirm(`¿Eliminar a ${e.name}? Esto no borra su historial de actividad, solo su ficha.`)) return;
    await api.del(`/employees/${e.id}`);
    refetch();
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div>
      <div style={{ marginBottom: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", maxWidth: 320, flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 10, color: COLORS.textTertiary }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o equipo"
            style={{
              width: "100%", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: "9px 12px 9px 34px", color: COLORS.textPrimary, fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={() => setFormModal("create")}
          className="chip-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none",
            background: COLORS.brand, color: "#fff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <Plus size={15} /> Agregar empleado
        </button>
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1360 }}>
            <thead>
              <tr>
                <Th></Th>
                <Th>Nombre</Th>
                <Th>Equipo</Th>
                <Th>Estado</Th>
                <Th align="right">Tiempo de trabajo</Th>
                <Th align="right">Actividad</Th>
                <Th align="right">Productivo</Th>
                <Th align="right">Improductivo</Th>
                <Th align="right">Neutral</Th>
                <Th align="right">Tiempo inactivo</Th>
                <Th align="right">Tiempo de break</Th>
                <Th>Última actividad</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const s = summaryByEmployee[e.id] || {
                  workedSeconds: 0, activitySeconds: 0, productiveSeconds: 0, unproductiveSeconds: 0,
                  neutralSeconds: 0, inactiveSeconds: 0, breakSeconds: 0, productivity: 0,
                };
                const blocks = blocksByEmployee[e.id] || [];
                const isOpen = expanded.has(e.id);
                return (
                  <Fragment key={e.id}>
                    <tr className="row-hover" style={{ cursor: "pointer" }} onClick={() => toggleExpanded(e.id)}>
                      <Td>
                        {isOpen ? <ChevronDown size={15} color={COLORS.textTertiary} /> : <ChevronRight size={15} color={COLORS.textTertiary} />}
                      </Td>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Initials name={e.name} />
                          <div>
                            <div>{e.name}</div>
                            <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>{e.role}</div>
                          </div>
                        </div>
                      </Td>
                      <Td>{e.team}</Td>
                      <Td>
                        <StatusPill status={e.status} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.workedSeconds} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.activitySeconds} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.productiveSeconds} color={s.productiveSeconds > 0 ? COLORS.live : undefined} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.unproductiveSeconds} color={s.unproductiveSeconds > 0 ? COLORS.critical : undefined} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.neutralSeconds} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.inactiveSeconds} color={s.inactiveSeconds > 0 ? COLORS.warn : undefined} />
                      </Td>
                      <Td align="right">
                        <DurationMetric seconds={s.breakSeconds} />
                      </Td>
                      <Td>
                        <span style={{ color: COLORS.textSecondary }}>{e.app}</span>
                      </Td>
                      <Td align="right">
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(ev) => ev.stopPropagation()}>
                          <button title="Editar" onClick={() => setFormModal(e)} className="chip-btn" style={iconBtnStyle}>
                            <Pencil size={13} color={COLORS.textSecondary} />
                          </button>
                          <button title="Contraseña" onClick={() => setPasswordModal(e)} className="chip-btn" style={iconBtnStyle}>
                            <KeyRound size={13} color={e.hasPassword ? COLORS.live : COLORS.warn} />
                          </button>
                          <button title="Eliminar" onClick={() => handleDelete(e)} className="chip-btn" style={iconBtnStyle}>
                            <Trash2 size={13} color={COLORS.critical} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <Td colSpan={12} style={{ background: COLORS.bg, padding: 0 }}>
                          <div style={{ padding: "14px 20px 18px 52px" }}>
                            <div style={{ display: "flex", gap: 20, marginBottom: 12, fontSize: 12.5, color: COLORS.textSecondary, flexWrap: "wrap" }}>
                              <span>Usuario: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{e.username || "sin asignar"}</span></span>
                              <span>Rol panel: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{e.roleName || "sin acceso"}</span></span>
                              <span>Trabajadas: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{formatDuration(s.workedSeconds)}</span></span>
                              <span>Neutral: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{formatDuration(s.neutralSeconds)}</span></span>
                              <span>Improductivo: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{formatDuration(s.unproductiveSeconds)}</span></span>
                              <span>Break (10-31): <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{formatDuration(s.breakSeconds)}</span></span>
                              <span>Productividad: <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{s.productivity}%</span></span>
                            </div>
                            {(() => {
                              const empDevices = devicesByEmployee[e.id] || [];
                              return (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginBottom: 6 }}>
                                    Computadoras usadas {empDevices.length > 1 && (
                                      <span style={{ color: COLORS.warn }}>· {empDevices.length} distintas</span>
                                    )}
                                  </div>
                                  {empDevices.length === 0 ? (
                                    <span style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Todavía no inició sesión desde la app de escritorio.</span>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {empDevices.map((d) => (
                                        <div key={d.hostname} style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                                          <span className="pulso-mono" style={{ color: COLORS.textPrimary }}>{d.hostname}</span>
                                          <span style={{ color: COLORS.textTertiary }}>
                                            última vez {new Date(d.lastSeenAt).toLocaleString("es-AR", { timeZone: "America/New_York", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {blocks.length === 0 ? (
                              <span style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Sin check-in registrado hoy.</span>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 480 }}>
                                <thead>
                                  <tr>
                                    <Th align="left">Check-in (1015)</Th>
                                    <Th align="left">Check-out (1025)</Th>
                                    <Th align="right">Duración</Th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {blocks.map((b) => (
                                    <tr key={b.id}>
                                      <Td mono>{b.checkIn}</Td>
                                      <Td mono>{b.checkOut ?? "—"}</Td>
                                      <Td align="right" mono>{b.checkOut ? b.hours : `${b.hours} (en curso)`}</Td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {formModal && (
        <EmployeeFormModal
          initial={formModal === "create" ? null : formModal}
          teams={teams || []}
          roles={roles || []}
          trackingConfigs={trackingConfigs || []}
          onClose={() => setFormModal(null)}
          onSaved={refetch}
        />
      )}
      {passwordModal && (
        <PasswordModal employee={passwordModal} onClose={() => setPasswordModal(null)} onSaved={refetch} />
      )}
    </div>
  );
}
