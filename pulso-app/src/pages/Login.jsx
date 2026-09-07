import { useState } from "react";
import { COLORS } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { LogoIcon, Wordmark } from "../components/Logo";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: COLORS.bg, color: COLORS.textPrimary,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 340, background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <LogoIcon size={32} />
          <Wordmark size={19} />
        </div>
        <div>
          <h1 className="pulso-display" style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Iniciar sesión</h1>
          <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: "4px 0 0" }}>
            Usá el mismo usuario y contraseña que en la app de escritorio.
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Usuario</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12.5, color: COLORS.textSecondary }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%", marginTop: 6, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: "9px 12px", color: COLORS.textPrimary, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>

        {error && <div style={{ color: COLORS.critical, fontSize: 12.5 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="chip-btn"
          style={{
            padding: "10px", borderRadius: 8, border: "none", background: COLORS.brand, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Ingresando…" : "Iniciar sesión"}
        </button>

        <p style={{ fontSize: 11, color: COLORS.textTertiary, margin: 0 }}>
          No hay recuperación de contraseña desde acá — pedile a un administrador que te asigne una nueva.
        </p>
      </form>
    </div>
  );
}
