import { SEVERITY_META } from "../../theme";

export default function SeverityPill({ severity }) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.Icon;
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
      <Icon size={13} />
      {meta.label}
    </span>
  );
}
