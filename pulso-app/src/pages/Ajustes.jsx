import { useState } from "react";
import { Ban, X, Plus, Copy, RefreshCw, Pencil, Trash2, Shield } from "lucide-react";
import { COLORS, NAV_ITEMS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, SectionHeading, StateMessage, Modal } from "../components/ui";

const PERMISSION_PAGES = NAV_ITEMS.flatMap((item) =>
  item.children ? item.children.map((c) => ({ id: c.id, label: c.label })) : [{ id: item.id, label: item.label }]
);
const SCOPABLE_PAGES = new Set(["actividades"]); // pages that support a "solo lo propio" variant

function RoleFormModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [permissions, setPermissions] = useState(new Set(initial?.permissions || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function isChecked(pageId) {
    return permissions.has(pageId) || permissions.has(`${pageId}:own`);
  }
  function isOwnScoped(pageId) {
    return permissions.has(`${pageId}:own`);
  }

  function togglePermission(pageId) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(pageId) || next.has(`${pageId}:own`)) {
        next.delete(pageId);
        next.delete(`${pageId}:own`);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  function setScope(pageId, own) {
    setPermissions((prev) => {
      const next = new Set(prev);
      next.delete(pageId);
      next.delete(`${pageId}:own`);
      next.add(own ? `${pageId}:own` : pageId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Ponele un nombre al rol.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), permissions: Array.from(permissions) };
      if (isEdit) await api.put(`/roles/${initial.id}`, payload);
      else await api.post("/roles", payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Editar rol" : "Nuevo rol"} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Nombre del rol</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Operador de despacho"
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 8, display: "block" }}>
            Páginas que puede ver
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
            {PERMISSION_PAGES.map((p) => (
              <div key={p.id}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={isChecked(p.id)} onChange={() => togglePermission(p.id)} />
                  {p.label}
                </label>
                {SCOPABLE_PAGES.has(p.id) && isChecked(p.id) && (
                  <div style={{ display: "flex", gap: 12, marginLeft: 24, marginTop: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.textSecondary, cursor: "pointer" }}>
                      <input type="radio" name={`scope-${p.id}`} checked={!isOwnScoped(p.id)} onChange={() => setScope(p.id, false)} />
                      Todos los empleados
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.textSecondary, cursor: "pointer" }}>
                      <input type="radio" name={`scope-${p.id}`} checked={isOwnScoped(p.id)} onChange={() => setScope(p.id, true)} />
                      Solo lo propio
                    </label>
                  </div>
                )}
              </div>
            ))}
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
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear rol"}
        </button>
      </div>
    </Modal>
  );
}

function RolesSection() {
  const { data: roles, loading, error, refetch } = useApi("/roles");
  const [formModal, setFormModal] = useState(null); // null | "create" | role object

  async function handleDelete(role) {
    if (!confirm(`¿Eliminar el rol "${role.name}"? Los empleados que lo tengan asignado quedan sin rol (van a poder loguearse en la app de escritorio pero no en el panel).`)) return;
    await api.del(`/roles/${role.id}`);
    refetch();
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <SectionHeading>Roles y permisos</SectionHeading>
        <button
          onClick={() => setFormModal("create")}
          className="chip-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none",
            background: COLORS.brand, color: "#fff", fontSize: 12.5, cursor: "pointer",
          }}
        >
          <Plus size={14} /> Nuevo rol
        </button>
      </div>

      {loading || error ? (
        <StateMessage loading={loading} error={error} onRetry={refetch} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(roles || []).map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, border: `1px solid ${COLORS.border}`,
              }}
            >
              <Shield size={15} color={COLORS.textTertiary} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>
                  {r.permissions.length} página{r.permissions.length === 1 ? "" : "s"} visible{r.permissions.length === 1 ? "" : "s"}
                </div>
              </div>
              <button onClick={() => setFormModal(r)} className="chip-btn" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Pencil size={13} color={COLORS.textSecondary} />
              </button>
              <button onClick={() => handleDelete(r)} className="chip-btn" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Trash2 size={13} color={COLORS.critical} />
              </button>
            </div>
          ))}
          {(roles || []).length === 0 && (
            <span style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Todavía no creaste ningún rol.</span>
          )}
        </div>
      )}

      {formModal && (
        <RoleFormModal
          initial={formModal === "create" ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={refetch}
        />
      )}
    </Card>
  );
}

function TrackingConfigFormModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [minutes, setMinutes] = useState(initial?.idleThresholdMinutes ?? 5);
  const [breakMinutes, setBreakMinutes] = useState(initial?.breakMinutes ?? 15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!name.trim()) { setError("Ponele un nombre."); return; }
    if (!minutes || Number(minutes) <= 0) { setError("El umbral de inactividad tiene que ser mayor a 0."); return; }
    if (!breakMinutes || Number(breakMinutes) <= 0) { setError("Los minutos de break tienen que ser mayor a 0."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), idleThresholdMinutes: Number(minutes), breakMinutes: Number(breakMinutes) };
      if (isEdit) await api.put(`/tracking-configs/${initial.id}`, payload);
      else await api.post("/tracking-configs", payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Editar configuración" : "Nueva configuración"} onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Reuniones largas"
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Minutos sin actividad antes de marcar inactivo</label>
          <input
            type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Minutos de break (10-31)</label>
          <input
            type="number" min="1" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)}
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
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
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear configuración"}
        </button>
      </div>
    </Modal>
  );
}

function TrackingConfigsSection() {
  const { data: configs, loading, error, refetch } = useApi("/tracking-configs");
  const [formModal, setFormModal] = useState(null);

  async function handleDelete(config) {
    if (!confirm(`¿Eliminar "${config.name}"? Los empleados que la tengan asignada vuelven al default de la empresa.`)) return;
    await api.del(`/tracking-configs/${config.id}`);
    refetch();
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <SectionHeading>Grupos de configuración de trackeo</SectionHeading>
        <button
          onClick={() => setFormModal("create")}
          className="chip-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none",
            background: COLORS.brand, color: "#fff", fontSize: 12.5, cursor: "pointer",
          }}
        >
          <Plus size={14} /> Nueva configuración
        </button>
      </div>
      <p style={{ fontSize: 12, color: COLORS.textTertiary, margin: "0 0 14px" }}>
        Asignale una de estas a un grupo de empleados desde su ficha en Empleados, en vez de tocar el
        default general de la empresa. Un override individual en la ficha del empleado siempre gana por
        encima de esto.
      </p>

      {loading || error ? (
        <StateMessage loading={loading} error={error} onRetry={refetch} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(configs || []).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <span className="pulso-mono" style={{ fontSize: 12, color: COLORS.textTertiary, marginLeft: 10 }}>{c.idleThresholdMinutes} min inactividad · {c.breakMinutes} min break</span>
              </div>
              <button onClick={() => setFormModal(c)} className="chip-btn" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Pencil size={13} color={COLORS.textSecondary} />
              </button>
              <button onClick={() => handleDelete(c)} className="chip-btn" style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Trash2 size={13} color={COLORS.critical} />
              </button>
            </div>
          ))}
          {(configs || []).length === 0 && <span style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Todavía no creaste ninguna.</span>}
        </div>
      )}

      {formModal && (
        <TrackingConfigFormModal
          initial={formModal === "create" ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={refetch}
        />
      )}
    </Card>
  );
}

export default function Ajustes() {
  const { data: settings, loading, error, refetch } = useApi("/settings");
  const [newApp, setNewApp] = useState("");
  const [token, setToken] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [companyName, setCompanyName] = useState(null);
  const [timezone, setTimezone] = useState(null);
  const [idleThreshold, setIdleThreshold] = useState(null);
  const [defaultBreakMinutes, setDefaultBreakMinutes] = useState(null);
  const [savingCompany, setSavingCompany] = useState(false);

  async function removeProhibited(app) {
    await api.del(`/settings/prohibited-apps/${encodeURIComponent(app)}`);
    refetch();
  }

  async function addProhibited() {
    if (!newApp.trim()) return;
    await api.post("/settings/prohibited-apps", { name: newApp.trim() });
    setNewApp("");
    refetch();
  }

  async function generateToken() {
    setGenerating(true);
    try {
      const result = await api.post("/settings/token", {});
      setToken(result.token);
      refetch();
    } finally {
      setGenerating(false);
    }
  }

  async function revokeToken() {
    if (!confirm("¿Quitar el token? Los operadores que ya lo tengan configurado en su app de escritorio van a dejar de poder marcar check-in/check-out hasta que generes uno nuevo y lo actualicen ahí.")) return;
    await api.del("/settings/token");
    setToken(null);
    refetch();
  }

  async function saveCompanyInfo() {
    setSavingCompany(true);
    try {
      await api.put("/settings", {
        companyName: companyName ?? settings.companyName,
        timezone: timezone ?? settings.timezone,
        idleThresholdMinutes: idleThreshold ?? settings.idleThresholdMinutes,
        defaultBreakMinutes: defaultBreakMinutes ?? settings.defaultBreakMinutes,
      });
      refetch();
    } finally {
      setSavingCompany(false);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
      <Card>
        <SectionHeading>Datos de la empresa</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Nombre de la empresa</label>
            <input
              defaultValue={settings.companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={{
                marginTop: 6, width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Zona horaria</label>
            <input
              defaultValue={settings.timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                marginTop: 6, width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
              Minutos sin actividad antes de marcar inactivo
            </label>
            <input
              type="number"
              min="1"
              defaultValue={settings.idleThresholdMinutes}
              onChange={(e) => setIdleThreshold(Number(e.target.value))}
              style={{
                marginTop: 6, width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
              }}
            />
            <p style={{ fontSize: 11.5, color: COLORS.textTertiary, margin: "6px 0 0" }}>
              La app de escritorio de los operadores lee este valor y marca "Inactivo" cuando no
              detecta movimiento de mouse ni teclado durante más de este tiempo.
            </p>
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
              Minutos de break (10-31) por defecto
            </label>
            <input
              type="number"
              min="1"
              defaultValue={settings.defaultBreakMinutes}
              onChange={(e) => setDefaultBreakMinutes(Number(e.target.value))}
              style={{
                marginTop: 6, width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
              }}
            />
            <p style={{ fontSize: 11.5, color: COLORS.textTertiary, margin: "6px 0 0" }}>
              Cuánto dura el botón 10-31 antes de que la cuenta regresiva llegue a cero. Se puede
              anular por grupo de configuración o por empleado individual.
            </p>
          </div>
          <button
            onClick={saveCompanyInfo}
            disabled={savingCompany}
            className="chip-btn"
            style={{
              alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8, border: "none",
              background: COLORS.brand, color: "#fff", fontSize: 13, cursor: savingCompany ? "default" : "pointer",
              opacity: savingCompany ? 0.7 : 1,
            }}
          >
            {savingCompany ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </Card>

      <Card>
        <SectionHeading>Aplicaciones prohibidas</SectionHeading>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {settings.prohibitedApps.map((app) => (
            <span
              key={app}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5,
                background: "rgba(240,85,90,0.12)", color: COLORS.critical, padding: "5px 6px 5px 10px", borderRadius: 20,
              }}
            >
              <Ban size={12} />
              {app}
              <button
                onClick={() => removeProhibited(app)}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.critical, display: "flex" }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newApp}
            onChange={(e) => setNewApp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProhibited()}
            placeholder="Agregar aplicación o sitio"
            style={{
              flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13,
            }}
          />
          <button
            onClick={addProhibited}
            className="chip-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none",
              background: COLORS.brand, color: "#fff", fontSize: 13, cursor: "pointer",
            }}
          >
            <Plus size={14} /> Agregar
          </button>
        </div>
      </Card>

      <Card>
        <SectionHeading>Conexión con la app de escritorio</SectionHeading>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: "0 0 14px" }}>
          Generá un token para vincular la aplicación de escritorio de cada operador con esta cuenta. Una vez generado,
          las rutas de check-in, check-out y actividades del servidor van a exigirlo en el header{" "}
          <span className="pulso-mono">Authorization: Bearer &lt;token&gt;</span>.
        </p>
        {token ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              className="pulso-mono"
              style={{
                flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                padding: "9px 12px", fontSize: 12.5, color: COLORS.textSecondary, overflowX: "auto",
              }}
            >
              {token}
            </div>
            <button
              onClick={() => navigator.clipboard && navigator.clipboard.writeText(token)}
              className="chip-btn"
              style={{
                background: COLORS.surfaceHover, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                padding: 9, cursor: "pointer", color: COLORS.textSecondary, display: "flex",
              }}
            >
              <Copy size={15} />
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={generateToken}
              disabled={generating}
              className="chip-btn"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8,
                border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, color: COLORS.textPrimary,
                fontSize: 13, cursor: generating ? "default" : "pointer", opacity: generating ? 0.7 : 1,
              }}
            >
              <RefreshCw size={14} /> {generating ? "Generando…" : settings.hasToken ? "Generar un token nuevo" : "Generar token"}
            </button>
            {settings.hasToken && (
              <button
                onClick={revokeToken}
                className="chip-btn"
                style={{
                  padding: "9px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
                  background: COLORS.surfaceHover, color: COLORS.critical, fontSize: 13, cursor: "pointer",
                }}
              >
                Quitar token
              </button>
            )}
          </div>
        )}
        {!token && settings.hasToken && (
          <p style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 10 }}>
            Ya hay un token activo (no se muestra de nuevo por seguridad). Generá uno nuevo si lo perdiste, o quitalo si no lo estás usando.
          </p>
        )}
      </Card>

      <RolesSection />
      <TrackingConfigsSection />
    </div>
  );
}
