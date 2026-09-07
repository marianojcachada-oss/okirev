import { COLORS } from "../../theme";

export default function ProgressBar({ value, color = COLORS.brand, height = 6 }) {
  return (
    <div style={{ width: "100%", height, borderRadius: 4, background: COLORS.border, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}
