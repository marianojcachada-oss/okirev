import { STATUS_META } from "../../theme";
import StatusDot from "./StatusDot";

export default function StatusPill({ status }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        color: meta.color,
        background: `${meta.color}1A`,
        padding: "3px 9px",
        borderRadius: 6,
      }}
    >
      <StatusDot status={status} size={6} />
      {meta.label}
    </span>
  );
}
