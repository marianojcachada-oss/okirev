import { Monitor } from "lucide-react";
import { COLORS } from "../theme";

// Nuestro formato de navegador es "Navegador - Nombre del sitio - https://hostname". Separa
// esas tres partes para poder mostrar un nombre corto y pedir el favicon real del sitio.
export function parseAppLabel(label) {
  const urlMatch = label.match(/https?:\/\/([^/\s]+)/);
  if (!urlMatch) return { displayName: label, hostname: null };
  const hostname = urlMatch[1];
  const parts = label.split(" - ");
  const displayName = parts.length >= 3 ? parts.slice(1, -1).join(" - ") : hostname;
  return { displayName, hostname };
}

// Ícono real (favicon del sitio) cuando hay hostname; ícono genérico si no (apps de escritorio
// sin URL, o entradas viejas de antes de este formato).
export function AppIcon({ hostname, size = 22 }) {
  if (hostname) {
    return (
      <div style={{ width: size, height: size, flexShrink: 0, position: "relative" }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
          alt=""
          style={{ width: size, height: size, borderRadius: 5, position: "absolute", top: 0, left: 0 }}
          onError={(e) => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "flex";
          }}
        />
        <div
          style={{
            width: size, height: size, borderRadius: 5, background: COLORS.surfaceHover,
            display: "none", alignItems: "center", justifyContent: "center", position: "absolute", top: 0, left: 0,
          }}
        >
          <Monitor size={size * 0.55} color={COLORS.textTertiary} />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 5, background: COLORS.surfaceHover,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <Monitor size={size * 0.55} color={COLORS.textTertiary} />
    </div>
  );
}
