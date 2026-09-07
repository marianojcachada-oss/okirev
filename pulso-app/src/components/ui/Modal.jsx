import { X } from "lucide-react";
import { COLORS } from "../../theme";

export default function Modal({ title, onClose, children, width = 440 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,11,16,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14,
          width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 className="pulso-display" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textTertiary, display: "flex" }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
