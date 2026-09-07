import { Monitor } from "lucide-react";
import { COLORS, REALTIME_GROUPS, realtimeGroupFor } from "../theme";
import { Card, Initials } from "./ui";

export function RealtimeStatusPill({ status }) {
  const group = realtimeGroupFor(status);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5,
        color: group.color, background: `${group.color}1A`, padding: "3px 9px", borderRadius: 6,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: group.color, display: "inline-block" }} />
      {group.label}
    </span>
  );
}

export function LiveFilterChips({ value, onChange }) {
  const options = [{ id: "todos", label: "Todos" }, ...Object.values(REALTIME_GROUPS)];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="chip-btn"
          style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
            border: `1px solid ${value === o.id ? COLORS.brand : COLORS.border}`,
            background: value === o.id ? "rgba(108,123,255,0.14)" : "transparent",
            color: value === o.id ? COLORS.textPrimary : COLORS.textSecondary,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function LiveGrid({ employees }) {
  if (employees.length === 0) {
    return <div style={{ padding: "30px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>Nadie coincide con este filtro.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
      {employees.map((e) => (
        <Card key={e.id}>
          <div style={{ display: "flex", gap: 10 }}>
            <Initials name={e.name} />
            <div>
              <div style={{ fontSize: 13.5 }}>{e.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>{e.team}</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <RealtimeStatusPill status={e.status} />
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, color: COLORS.textSecondary, fontSize: 12.5 }}>
            <Monitor size={13} />
            <span>{e.app}</span>
          </div>
          <div className="pulso-mono" style={{ marginTop: 8, fontSize: 11.5, color: COLORS.textTertiary }}>
            Último check-in {e.checkIn}
          </div>
        </Card>
      ))}
    </div>
  );
}
