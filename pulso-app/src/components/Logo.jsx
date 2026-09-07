import { COLORS } from "../theme";

export function LogoIcon({ size = 30 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        flexShrink: 0,
        background: COLORS.surfaceHover,
        border: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <span
        className="pulso-display"
        style={{ fontSize: size * 0.38, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: "-0.02em" }}
      >
        OK
      </span>
      <span style={{ width: 2, height: size * 0.42, background: COLORS.brand, borderRadius: 1, display: "inline-block" }} />
    </div>
  );
}

export function Wordmark({ size = 17 }) {
  return (
    <span
      className="pulso-display"
      style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em", display: "inline-flex", alignItems: "center", gap: 2 }}
    >
      <span style={{ color: COLORS.textPrimary }}>OK</span>
      <span style={{ width: 2, height: size * 0.85, background: COLORS.brand, borderRadius: 1, display: "inline-block" }} />
      <span style={{ color: COLORS.textSecondary, fontWeight: 500 }}>rev</span>
    </span>
  );
}
