import { useState } from "react";
import { Ban, X, Plus, Pencil, Trash2, Shield, Palette, AlertTriangle, PowerOff, RotateCcw, Video } from "lucide-react";
import { COLORS, NAV_ITEMS, THEMES } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { Card, SectionHeading, StateMessage, Modal } from "../components/ui";

// Mismos sitios que el tracker ya reconoce para el registro de actividad (tracker.js,
// TITLE_SITE_PATTERNS) — los hostnames tienen que coincidir exactamente, porque son los que el
// tracker compara para decidir en qué pantalla estuvo cada uno.
const KNOWN_PRIORITY_SITES = [
  { name: "Taxi caller", hostname: "app.taxicaller.net" },
  { name: "Microsoft Teams", hostname: "teams.microsoft.com" },
  { name: "Outlook", hostname: "outlook.office.com" },
  { name: "Gmail", hostname: "mail.google.com" },
  { name: "RingCentral", hostname: "app.ringcentral.com" },
  { name: "Salesforce", hostname: "salesforce.com" },
  { name: "Zendesk", hostname: "zendesk.com" },
  { name: "Slack", hostname: "slack.com" },
];

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
        // Default to the narrower "own only" scope when available — safer default, since
        // it's easy to widen to "todos" with one click but easy to miss narrowing it down.
        next.add(SCOPABLE_PAGES.has(pageId) ? `${pageId}:own` : pageId);
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

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Palette size={16} color={COLORS.textSecondary} />
        <SectionHeading>Tema del panel</SectionHeading>
      </div>
      <p style={{ fontSize: 12.5, color: COLORS.textTertiary, margin: "0 0 14px" }}>
        Es una preferencia de esta computadora/navegador — cada persona puede elegir el suyo, no afecta a nadie más.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="chip-btn"
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, cursor: "pointer",
              border: `1px solid ${theme === t.id ? COLORS.brand : COLORS.border}`,
              background: theme === t.id ? "rgba(108,123,255,0.14)" : "transparent",
              color: theme === t.id ? COLORS.textPrimary : COLORS.textSecondary,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </Card>
  );
}


// Los mismos valores de bitrate que usa el tracker para grabar — se mantienen iguales acá para
// que la estimación de almacenamiento sea real, no un número inventado aparte.
const RECORDING_BITRATES = { low: 150000, medium: 350000, high: 800000 };
const RECORDING_PRESETS = {
  ahorro: { fps: 2, quality: "low", maxWidth: 960, chunkMinutes: 5 },
  balanceado: { fps: 3, quality: "medium", maxWidth: 1280, chunkMinutes: 5 },
  alta_calidad: { fps: 5, quality: "high", maxWidth: 1920, chunkMinutes: 5 },
};

function estimateGbPerOperatorPerShift(quality, hours = 8) {
  const bitsPerSecond = RECORDING_BITRATES[quality] || RECORDING_BITRATES.medium;
  const bytes = (bitsPerSecond * hours * 3600) / 8;
  return bytes / 1e9;
}

function RecordingSection() {
  const { data: recSettings, loading, error, refetch } = useApi("/recordings/settings");
  const [saving, setSaving] = useState(false);

  async function patchRecordingSettings(patch) {
    setSaving(true);
    try {
      await api.put("/recordings/settings", patch);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function applyPreset(presetName) {
    if (presetName === "personalizado") {
      await patchRecordingSettings({ preset: "personalizado" });
      return;
    }
    await patchRecordingSettings({ preset: presetName, ...RECORDING_PRESETS[presetName] });
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  const isCustom = recSettings.preset === "personalizado";
  const toggleStyle = (on) => ({
    flexShrink: 0, width: 40, height: 22, borderRadius: 20, border: "none", cursor: "pointer", position: "relative",
    background: on ? COLORS.brand : COLORS.surfaceHover, transition: "background 0.15s",
  });
  const knobStyle = (on) => ({
    position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
  });
  const fieldLabelStyle = { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4, display: "block" };
  const selectStyle = {
    width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5,
  };

  return (
    <Card style={{ border: `1px solid ${COLORS.critical}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Video size={16} color={COLORS.critical} />
        <SectionHeading>Grabación de pantalla</SectionHeading>
      </div>
      <p style={{ fontSize: 12.5, color: COLORS.textTertiary, margin: "0 0 14px" }}>
        Graba la pantalla completa de cada operador durante su turno. Es una función sensible — avisale al equipo antes de activarla.
      </p>

      {!recSettings.storageConfigured && (
        <div style={{
          background: "rgba(240,85,90,0.1)", border: `1px solid ${COLORS.critical}`, borderRadius: 8,
          padding: "10px 12px", fontSize: 12.5, color: COLORS.critical, marginBottom: 14,
        }}>
          El almacenamiento (Supabase Storage) todavía no está configurado en el servidor — aunque lo actives acá, no va a grabar nada hasta que esté listo del otro lado.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, color: COLORS.textPrimary }}>Grabar la pantalla durante el turno</div>
          <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>Apagado por default.</div>
        </div>
        <button
          onClick={() => patchRecordingSettings({ enabled: !recSettings.enabled })}
          role="switch" aria-checked={recSettings.enabled} disabled={saving}
          style={toggleStyle(recSettings.enabled)}
        >
          <span style={knobStyle(recSettings.enabled)} />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
        <div>
          <div style={{ fontSize: 13, color: COLORS.textPrimary }}>Grabar también audio (sistema y micrófono)</div>
          <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2, maxWidth: 480 }}>
            Apagado por default. Si tus operadores atienden llamadas por la compu, esto graba la voz de quien llama también —
            no solo la del empleado. Confirmá que tenés el aviso o consentimiento correspondiente antes de prenderlo.
          </div>
        </div>
        <button
          onClick={() => patchRecordingSettings({ audioEnabled: !recSettings.audioEnabled })}
          role="switch" aria-checked={recSettings.audioEnabled} disabled={saving}
          style={toggleStyle(recSettings.audioEnabled)}
        >
          <span style={knobStyle(recSettings.audioEnabled)} />
        </button>
      </div>

      <div style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.border}`, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 13, color: COLORS.textPrimary }}>Priorizar calidad según sitio</div>
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>
              Si el operador tiene más de un monitor, la pantalla donde esté este sitio en primer plano graba a la
              resolución "prioritaria"; el resto, a la "secundaria". El cambio se aplica recién al arrancar el
              próximo pedazo (cada tantos minutos como tengas configurado), no al instante.
            </div>
          </div>
          <select
            value={recSettings.prioritySite || ""}
            onChange={(e) => patchRecordingSettings({ prioritySite: e.target.value || null })}
            disabled={saving}
            style={{
              background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
              padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5, minWidth: 180,
            }}
          >
            <option value="">Ninguno</option>
            {KNOWN_PRIORITY_SITES.map((s) => (
              <option key={s.hostname} value={s.hostname}>{s.name}</option>
            ))}
          </select>
        </div>
        {recSettings.prioritySite && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <div>
              <label style={fieldLabelStyle}>Resolución prioritaria (donde esté el sitio)</label>
              <select
                style={selectStyle} disabled={saving}
                value={recSettings.priorityWidth || 1280}
                onChange={(e) => patchRecordingSettings({ priorityWidth: Number(e.target.value) })}
              >
                <option value={960}>960px</option>
                <option value={1280}>1280px</option>
                <option value={1920}>1920px</option>
              </select>
            </div>
            <div>
              <label style={fieldLabelStyle}>Resolución secundaria (el resto de las pantallas)</label>
              <select
                style={selectStyle} disabled={saving}
                value={recSettings.secondaryWidth || 960}
                onChange={(e) => patchRecordingSettings({ secondaryWidth: Number(e.target.value) })}
              >
                <option value={640}>640px</option>
                <option value={960}>960px</option>
                <option value={1280}>1280px</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 8, fontWeight: 600 }}>Prioridad</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "ahorro", label: "Ahorro de almacenamiento" },
            { id: "balanceado", label: "Balanceado" },
            { id: "alta_calidad", label: "Alta calidad" },
            { id: "personalizado", label: "Personalizado" },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              disabled={saving}
              style={{
                padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${recSettings.preset === p.id ? COLORS.brand : COLORS.border}`,
                background: recSettings.preset === p.id ? "rgba(108,123,255,0.14)" : "transparent",
                color: recSettings.preset === p.id ? COLORS.textPrimary : COLORS.textSecondary,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isCustom && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={fieldLabelStyle}>Cuadros por segundo</label>
            <select style={selectStyle} value={recSettings.fps} disabled={saving}
              onChange={(e) => patchRecordingSettings({ fps: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 8, 10].map((v) => <option key={v} value={v}>{v} fps</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle}>Resolución máxima</label>
            <select style={selectStyle} value={recSettings.maxWidth} disabled={saving}
              onChange={(e) => patchRecordingSettings({ maxWidth: Number(e.target.value) })}>
              <option value={960}>960px (más liviano)</option>
              <option value={1280}>1280px</option>
              <option value={1920}>1920px (más nítido)</option>
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle}>Calidad de compresión</label>
            <select style={selectStyle} value={recSettings.quality} disabled={saving}
              onChange={(e) => patchRecordingSettings({ quality: e.target.value })}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle}>Minutos por pedazo</label>
            <select style={selectStyle} value={recSettings.chunkMinutes} disabled={saving}
              onChange={(e) => patchRecordingSettings({ chunkMinutes: Number(e.target.value) })}>
              {[2, 5, 10, 15, 30].map((v) => <option key={v} value={v}>{v} minutos</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={fieldLabelStyle}>Días de retención antes de borrarse solas</label>
        <select style={{ ...selectStyle, maxWidth: 220 }} value={recSettings.retentionDays} disabled={saving}
          onChange={(e) => patchRecordingSettings({ retentionDays: Number(e.target.value) })}>
          {[7, 14, 30, 60, 90].map((v) => <option key={v} value={v}>{v} días</option>)}
        </select>
      </div>

      <div style={{ background: COLORS.bg, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: COLORS.textSecondary }}>
        Con esta configuración: ~{estimateGbPerOperatorPerShift(recSettings.quality).toFixed(2)} GB por operador, por turno de 8 horas.
        Multiplicá por tu cantidad de operadores activos por día para estimar el total.
      </div>
    </Card>
  );
}

// Para cuando UNA compu puntual necesita menos calidad que el resto del equipo — una excepción
// que aplica solo a ese operador, sin tocar la configuración general de arriba.
function RecordingOverrideSection() {
  const { data: employees } = useApi("/employees");
  const [employeeId, setEmployeeId] = useState("");
  const { data: overrideData, loading, refetch } = useApi(employeeId ? `/recordings/settings/employee/${employeeId}` : null);
  const [saving, setSaving] = useState(false);

  async function patchOverride(patch) {
    setSaving(true);
    try {
      await api.put(`/recordings/settings/employee/${employeeId}`, patch);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setSaving(true);
    try {
      await api.del(`/recordings/settings/employee/${employeeId}`);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = overrideData?.override && Object.values(overrideData.override).some((v) => v !== null && v !== undefined);
  const selectStyle = {
    background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "7px 10px", color: COLORS.textPrimary, fontSize: 12.5, minWidth: 200,
  };

  return (
    <Card style={{ marginTop: 18 }}>
      <SectionHeading>Excepción de grabación por operador</SectionHeading>
      <p style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 4, marginBottom: 14, maxWidth: 520 }}>
        Para cuando un operador puntual se queja de que se le traba — bajale la calidad solo a él, sin
        tocar la configuración general del resto del equipo.
      </p>

      <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ ...selectStyle, marginBottom: 14 }}>
        <option value="">Elegí un operador…</option>
        {(employees || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {employeeId && loading && <p style={{ fontSize: 12.5, color: COLORS.textTertiary }}>Cargando…</p>}

      {employeeId && overrideData && (
        <>
          {hasOverride ? (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(108,123,255,0.1)",
              border: `1px solid ${COLORS.brand}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5,
            }}>
              <span style={{ color: COLORS.textPrimary }}>Este operador tiene una excepción activa — graba distinto al resto.</span>
              <button
                onClick={clearOverride} disabled={saving}
                style={{ background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary, borderRadius: 16, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
              >
                Quitar excepción
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: COLORS.textTertiary, marginBottom: 14 }}>
              Sin excepción — graba igual que la configuración general.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "ahorro", label: "Ahorro de almacenamiento" },
              { id: "balanceado", label: "Balanceado" },
              { id: "alta_calidad", label: "Alta calidad" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => patchOverride(RECORDING_PRESETS[p.id])}
                disabled={saving}
                style={{
                  padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                  border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textSecondary,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function SuperAdminSection() {
  const [disconnecting, setDisconnecting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  async function handleDisconnectAll() {
    if (
      !confirm(
        '¿Desconectar a TODOS los empleados que figuren activos ahora mismo? Se les cierra el check-in abierto (y cualquier break abierto) y quedan en "Ausente". No se puede deshacer.'
      )
    )
      return;
    setDisconnecting(true);
    setLastResult(null);
    try {
      const result = await api.post("/employees/disconnect-all", {});
      setLastResult(`Se desconectó a ${result.disconnected} empleado(s).`);
    } catch (err) {
      alert(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleResetToday() {
    if (
      !confirm(
        "¿Reiniciar TODOS los contadores de HOY a 0:00? Esto borra los bloques de asistencia y toda la actividad registrada hoy para TODA la empresa. No afecta días anteriores."
      )
    )
      return;
    if (!confirm("Confirmá una vez más: se va a borrar la asistencia y actividad de HOY de todos los empleados. Esta acción NO se puede deshacer. ¿Continuar?"))
      return;
    setResetting(true);
    setLastResult(null);
    try {
      const result = await api.post("/employees/reset-today", {});
      setLastResult(`Se borraron ${result.attendanceDeleted} bloque(s) de asistencia y ${result.activitiesDeleted} registro(s) de actividad de hoy.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card style={{ border: `1px solid ${COLORS.critical}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <AlertTriangle size={16} color={COLORS.critical} />
        <SectionHeading>Zona de superadministrador</SectionHeading>
      </div>
      <p style={{ fontSize: 12.5, color: COLORS.textTertiary, margin: "0 0 14px" }}>
        Estas dos acciones son irreversibles y afectan a toda la empresa de una sola vez. Solo tu cuenta puede verlas y usarlas.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={handleDisconnectAll}
          disabled={disconnecting}
          className="chip-btn"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8,
            border: `1px solid ${COLORS.border}`, background: COLORS.surfaceHover, color: COLORS.textPrimary,
            fontSize: 13, cursor: disconnecting ? "default" : "pointer", opacity: disconnecting ? 0.7 : 1,
          }}
        >
          <PowerOff size={14} /> {disconnecting ? "Desconectando…" : "Desconectar a todos los activos"}
        </button>
        <button
          onClick={handleResetToday}
          disabled={resetting}
          className="chip-btn"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8,
            border: `1px solid ${COLORS.critical}`, background: "rgba(240,85,90,0.1)", color: COLORS.critical,
            fontSize: 13, cursor: resetting ? "default" : "pointer", opacity: resetting ? 0.7 : 1,
          }}
        >
          <RotateCcw size={14} /> {resetting ? "Reiniciando…" : "Reiniciar contadores de hoy a 0:00"}
        </button>
      </div>
      {lastResult && <p style={{ fontSize: 12.5, color: COLORS.live, marginTop: 12 }}>{lastResult}</p>}
    </Card>
  );
}

export default function Ajustes() {
  const { user } = useAuth();
  const { data: settings, loading, error, refetch } = useApi("/settings");
  const [newApp, setNewApp] = useState("");
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

  async function toggleProhibitedAlerts() {
    await api.put("/settings", { prohibitedAppsAlertsEnabled: !settings.prohibitedAppsAlertsEnabled });
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
      <RecordingSection />
      <RecordingOverrideSection />
      {user?.isSuperAdmin && <SuperAdminSection />}
      <ThemeSection />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <SectionHeading>Aplicaciones prohibidas</SectionHeading>
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "10px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: COLORS.textPrimary }}>Generar alertas cuando alguien las use</div>
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>
              Apagado por default. Una alerta por persona y app por día, no una por cada minuto que la tenga abierta.
            </div>
          </div>
          <button
            onClick={toggleProhibitedAlerts}
            role="switch"
            aria-checked={settings.prohibitedAppsAlertsEnabled}
            style={{
              flexShrink: 0, width: 40, height: 22, borderRadius: 20, border: "none", cursor: "pointer", position: "relative",
              background: settings.prohibitedAppsAlertsEnabled ? COLORS.brand : COLORS.surfaceHover,
              transition: "background 0.15s",
            }}
          >
            <span
              style={{
                position: "absolute", top: 2, left: settings.prohibitedAppsAlertsEnabled ? 20 : 2,
                width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
              }}
            />
          </button>
        </div>
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

      <RolesSection />
      <TrackingConfigsSection />
    </div>
  );
}
