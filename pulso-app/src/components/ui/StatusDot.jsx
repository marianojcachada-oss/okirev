import { STATUS_META } from "../../theme";

export default function StatusDot({ status, size = 8 }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={status === "activo" ? "live-dot" : ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: meta.color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
