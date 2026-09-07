import { COLORS } from "../../theme";
import Card from "./Card";

export default function StatCard({ label, value, sub, accent }) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</div>
      <div
        className="pulso-display"
        style={{ fontSize: 27, fontWeight: 600, marginTop: 10, color: accent || COLORS.textPrimary }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, marginTop: 6, color: COLORS.textTertiary }}>{sub}</div>}
    </Card>
  );
}
