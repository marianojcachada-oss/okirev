import { useMemo, useState } from "react";
import { LogIn, LogOut, Plus } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, SectionHeading, Th, Td, StateMessage, Modal } from "../components/ui";
import { DATE_PRESETS, computeRange, atlantaToday } from "../utils/dateRanges";
import { useAuth } from "../auth/AuthContext";

function ManualBlockModal({ employees, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(atlantaToday());
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!employeeId) { setError("Elegí un empleado."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post("/attendance/manual", { employeeId, date, checkIn, checkOut });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12.5, color: COLORS.textSecondary };

  return (
    <Modal title="Agregar bloque manual" onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 12, color: COLORS.textTertiary, margin: 0 }}>
          Para cuando un empleado se olvidó de prender la app y trabajó igual. Esto crea el
          bloque completo (entrada y salida) directamente — no pasa por la app de escritorio.
        </p>
        <div>
          <label style={labelStyle}>Empleado</label>
          <select style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Elegí un empleado…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {e.team}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Fecha</label>
          <input type="date" style={inputStyle} value={date} max={atlantaToday()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Check-in (1015)</label>
            <input type="time" style={inputStyle} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Check-out (1025)</label>
            <input type="time" style={inputStyle} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
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
          {saving ? "Guardando…" : "Agregar bloque"}
        </button>
      </div>
    </Modal>
  );
}

export default function Asistencia() {
  const { hasPermission } = useAuth();
  const [preset, setPreset] = useState("hoy");
  const [customFrom, setCustomFrom] = useState(atlantaToday());
  const [customTo, setCustomTo] = useState(atlantaToday());
  const [isCustom, setIsCustom] = useState(false);

  const { from, to } = isCustom ? { from: customFrom, to: customTo } : computeRange(preset);

  const { data: employees, loading: loadingEmployees, error: errorEmployees, refetch: refetchEmployees } = useApi("/employees");
  const { data: attendance, loading: loadingAttendance, error: errorAttendance, refetch: refetchAttendance } = useApi(
    `/attendance?from=${from}&to=${to}`
  );
  const { data: summary, loading: loadingSummary, error: errorSummary } = useApi(`/employees/summary?from=${from}&to=${to}`);

  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);

  const loading = loadingEmployees || loadingAttendance || loadingSummary;
  const error = errorEmployees || errorAttendance || errorSummary;

  const employeeById = useMemo(() => {
    const map = {};
    (employees || []).forEach((e) => { map[e.id] = e; });
    return map;
  }, [employees]);

  const totals = useMemo(() => {
    if (!summary) return [];
    return summary
      .filter((s) => s.blocks > 0)
      .map((s) => ({ ...s, employee: employeeById[s.employeeId] }))
      .filter((s) => s.employee)
      .sort((a, b) => b.workedHours - a.workedHours);
  }, [summary, employeeById]);

  const openByEmployee = useMemo(() => {
    if (!attendance) return {};
    const map = {};
    attendance.forEach((a) => { if (a.checkOut === null) map[a.employeeId] = a; });
    return map;
  }, [attendance]);

  function selectPreset(id) {
    setPreset(id);
    setIsCustom(false);
  }

  function refetchAll() {
    refetchEmployees();
    refetchAttendance();
  }

  async function checkIn() {
    if (!selectedId) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.post("/attendance/checkin", { employeeId: selectedId });
      refetchAll();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    if (!selectedId) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.post("/attendance/checkout", { employeeId: selectedId });
      refetchAll();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetchAll} />;

  const selectedHasOpen = selectedId ? !!openByEmployee[selectedId] : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(45,212,167,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogIn size={16} color={COLORS.live} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>Código de check-in</div>
            <div className="pulso-mono" style={{ fontSize: 15 }}>1015</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(240,85,90,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LogOut size={16} color={COLORS.critical} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>Código de check-out</div>
            <div className="pulso-mono" style={{ fontSize: 15 }}>1025</div>
          </div>
        </div>

        <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", color: COLORS.textPrimary, fontSize: 12.5, minWidth: 200 }}
          >
            <option value="">Registro manual: elegí un empleado…</option>
            {(employees || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {e.team}</option>
            ))}
          </select>
          <button
            onClick={checkIn}
            disabled={!selectedId || busy || selectedHasOpen}
            className="chip-btn"
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
              background: COLORS.surfaceHover, color: COLORS.live, fontSize: 12.5,
              cursor: !selectedId || busy || selectedHasOpen ? "default" : "pointer",
              opacity: !selectedId || busy || selectedHasOpen ? 0.5 : 1,
            }}
          >
            Check-in
          </button>
          <button
            onClick={checkOut}
            disabled={!selectedId || busy || !selectedHasOpen}
            className="chip-btn"
            style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
              background: COLORS.surfaceHover, color: COLORS.critical, fontSize: 12.5,
              cursor: !selectedId || busy || !selectedHasOpen ? "default" : "pointer",
              opacity: !selectedId || busy || !selectedHasOpen ? 0.5 : 1,
            }}
          >
            Check-out
          </button>
          {hasPermission("ajustes") && (
            <button
              onClick={() => setShowManualModal(true)}
              className="chip-btn"
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none",
                background: COLORS.brand, color: "#fff", fontSize: 12.5, cursor: "pointer",
              }}
            >
              <Plus size={13} /> Bloque manual (olvido de prender la app)
            </button>
          )}
        </div>
        {formError && <div style={{ color: COLORS.critical, fontSize: 12.5, width: "100%" }}>{formError}</div>}
      </Card>

      {showManualModal && (
        <ManualBlockModal
          employees={employees || []}
          onClose={() => setShowManualModal(false)}
          onSaved={refetchAll}
        />
      )}

      <Card>
        <SectionHeading>Rango de fechas</SectionHeading>
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
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }}
          />
          <span style={{ color: COLORS.textTertiary, fontSize: 12.5 }}>hasta</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setIsCustom(true); }}
            style={{ background: COLORS.bg, border: `1px solid ${isCustom ? COLORS.brand : COLORS.border}`, borderRadius: 8, padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5 }}
          />
          <span className="pulso-mono" style={{ fontSize: 11.5, color: COLORS.textTertiary, marginLeft: "auto" }}>
            {from} → {to}
          </span>
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px 0" }}>
          <SectionHeading>Totales por empleado en el rango</SectionHeading>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Equipo</Th>
              <Th align="right">Bloques</Th>
              <Th align="right">Horas trabajadas</Th>
              <Th align="right">Productividad</Th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.employeeId} className="row-hover">
                <Td>{t.employee.name}</Td>
                <Td>{t.employee.team}</Td>
                <Td align="right" mono>{t.blocks}</Td>
                <Td align="right" mono>{t.workedHours} h</Td>
                <Td align="right" mono>{t.productivity}%</Td>
              </tr>
            ))}
            {totals.length === 0 && (
              <tr>
                <Td colSpan={5}><span style={{ color: COLORS.textTertiary }}>Nadie registró check-in en este rango.</span></Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px 0", fontSize: 12.5, color: COLORS.textSecondary }}>
          Bloques en el rango ({attendance.length})
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Equipo</Th>
              <Th>Fecha</Th>
              <Th align="right">Check-in (1015)</Th>
              <Th align="right">Check-out (1025)</Th>
              <Th align="right">Duración</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.id} className="row-hover">
                <Td>{a.name}</Td>
                <Td>{a.team}</Td>
                <Td mono>{a.date}</Td>
                <Td align="right" mono>{a.checkIn}</Td>
                <Td align="right" mono>{a.checkOut ?? "—"}</Td>
                <Td align="right" mono>{a.checkOut ? a.hours : `${a.hours} (en curso)`}</Td>
                <Td>
                  <span style={{ fontSize: 12.5, color: a.checkOut === null ? COLORS.warn : COLORS.live }}>
                    {a.checkOut === null ? "En curso" : "Completo"}
                  </span>
                </Td>
              </tr>
            ))}
            {attendance.length === 0 && (
              <tr>
                <Td colSpan={7}><span style={{ color: COLORS.textTertiary }}>No hay bloques en este rango.</span></Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
