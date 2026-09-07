import { useEffect, useState } from "react";
import { COLORS } from "../theme";

export default function TopBar({ title, subtitle }) {
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clockStr = clock.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "28px 32px 22px" }}>
      <div>
        <h1 className="pulso-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          {title}
        </h1>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: "4px 0 0" }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.live, display: "inline-block" }} />
        <span className="pulso-mono" style={{ fontSize: 13, color: COLORS.textSecondary }}>
          {clockStr} <span style={{ color: COLORS.textTertiary }}>ET</span>
        </span>
      </div>
    </div>
  );
}
