import { useMemo, useState } from "react";
import { Monitor, Check, X as XIcon } from "lucide-react";
import { COLORS } from "../theme";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import { Card, Th, Td, StateMessage } from "../components/ui";

const CATEGORIES = [
  { id: "Productiva", label: "Productiva", color: COLORS.live },
  { id: "Neutral", label: "Neutral", color: COLORS.brand },
  { id: "Improductiva", label: "Improductiva", color: COLORS.critical },
];

function CategoryButtons({ current, onChange, pending }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      {CATEGORIES.map((c) => {
        const isActive = current === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className="chip-btn"
            style={{
              padding: "5px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: `1px solid ${isActive ? c.color : COLORS.border}`,
              borderStyle: isActive && pending ? "dashed" : "solid",
              background: isActive ? `${c.color}1A` : "transparent",
              color: isActive ? c.color : COLORS.textSecondary,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Catalogo() {
  const [filter, setFilter] = useState("unclassified");
  const { data: catalog, loading, error, refetch } = useApi(`/catalog?filter=${filter}`);
  const [selected, setSelected] = useState(new Set());
  const [pending, setPending] = useState({}); // appLabel -> category, staged but not yet saved
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    if (!catalog) return [];
    return catalog.slice().sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
  }, [catalog]);

  const pendingCount = Object.keys(pending).length;

  function stageCategory(appLabel, category) {
    setPending((prev) => ({ ...prev, [appLabel]: category }));
  }

  function toggleSelected(appLabel) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appLabel)) next.delete(appLabel);
      else next.add(appLabel);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === sorted.length ? new Set() : new Set(sorted.map((c) => c.appLabel))));
  }

  function applyToSelected(category) {
    setPending((prev) => {
      const next = { ...prev };
      selected.forEach((appLabel) => { next[appLabel] = category; });
      return next;
    });
  }

  function cancelPending() {
    setPending({});
  }

  async function savePending() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(pending).map(([appLabel, category]) => api.put(`/catalog/${encodeURIComponent(appLabel)}`, { category }))
      );
      setPending({});
      setSelected(new Set());
      refetch();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: "0 0 14px" }}>
          Cada aplicación y sitio que detecta la app de escritorio aparece acá <strong>una sola vez</strong>.
          Clasificalo como Productiva, Neutral o Improductiva y esa clasificación se aplica
          automáticamente a partir de ahora — no hace falta tocar nada en la computadora del operador.
          Los cambios no se guardan hasta que apretás "Guardar cambios".
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { id: "unclassified", label: "Sin clasificar" },
            { id: "all", label: "Todas" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="chip-btn"
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${filter === f.id ? COLORS.brand : COLORS.border}`,
                background: filter === f.id ? "rgba(108,123,255,0.14)" : "transparent",
                color: filter === f.id ? COLORS.textPrimary : COLORS.textSecondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {selected.size > 0 && (
        <Card style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"} — marcar todas como:
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => applyToSelected(c.id)}
                className="chip-btn"
                style={{
                  padding: "6px 13px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${c.color}`, background: `${c.color}1A`, color: c.color,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>
                <input type="checkbox" checked={sorted.length > 0 && selected.size === sorted.length} onChange={toggleSelectAll} />
              </Th>
              <Th>Aplicación / sitio</Th>
              <Th>Detectado por primera vez</Th>
              <Th align="right">Clasificación</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const isPending = c.appLabel in pending;
              const effectiveCategory = isPending ? pending[c.appLabel] : c.category === "sin_clasificar" ? null : c.category;
              return (
                <tr key={c.appLabel} className="row-hover" style={isPending ? { background: "rgba(108,123,255,0.06)" } : undefined}>
                  <Td>
                    <input type="checkbox" checked={selected.has(c.appLabel)} onChange={() => toggleSelected(c.appLabel)} />
                  </Td>
                  <Td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Monitor size={13} color={COLORS.textTertiary} />
                      <span style={{ wordBreak: "break-word" }}>{c.appLabel}</span>
                      {isPending && <span style={{ fontSize: 10.5, color: COLORS.brand }}>sin guardar</span>}
                    </div>
                  </Td>
                  <Td mono>{new Date(c.firstSeenAt).toLocaleDateString("es-AR", { timeZone: "America/New_York" })}</Td>
                  <Td align="right">
                    <CategoryButtons
                      current={effectiveCategory}
                      pending={isPending}
                      onChange={(cat) => stageCategory(c.appLabel, cat)}
                    />
                  </Td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <Td colSpan={4}>
                  <span style={{ color: COLORS.textTertiary }}>
                    {filter === "unclassified" ? "No hay nada pendiente de clasificar." : "Todavía no se detectó ninguna aplicación."}
                  </span>
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {pendingCount > 0 && (
        <div
          style={{
            position: "sticky", bottom: 20, marginTop: 18, display: "flex", alignItems: "center", gap: 12,
            justifyContent: "flex-end", background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: "12px 16px",
          }}
        >
          <span style={{ fontSize: 12.5, color: COLORS.textSecondary, marginRight: "auto" }}>
            {pendingCount} cambio{pendingCount === 1 ? "" : "s"} sin guardar
          </span>
          <button
            onClick={cancelPending}
            disabled={saving}
            className="chip-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textPrimary,
              fontSize: 12.5, cursor: saving ? "default" : "pointer",
            }}
          >
            <XIcon size={13} /> Cancelar
          </button>
          <button
            onClick={savePending}
            disabled={saving}
            className="chip-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none",
              background: COLORS.brand, color: "#fff", fontSize: 12.5, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            }}
          >
            <Check size={13} /> {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
