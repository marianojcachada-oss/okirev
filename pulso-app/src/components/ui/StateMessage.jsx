import { COLORS } from "../../theme";

export default function StateMessage({ loading, error, onRetry }) {
  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: COLORS.textSecondary, fontSize: 13.5 }}>Cargando…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: COLORS.critical, fontSize: 13.5 }}>
        No se pudo conectar con la API: {error}
        {onRetry && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={onRetry}
              className="chip-btn"
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surfaceHover,
                color: COLORS.textPrimary,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }
  return null;
}
