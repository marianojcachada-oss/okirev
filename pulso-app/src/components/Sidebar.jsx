import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { COLORS, NAV_ITEMS } from "../theme";
import Initials from "./ui/Initials";
import { LogoIcon, Wordmark } from "./Logo";
import { useAuth } from "../auth/AuthContext";

export default function Sidebar({ collapsed, onToggleCollapse, openAlerts }) {
  const location = useLocation();
  const { user, hasPermission, logout } = useAuth();
  const [informesOpen, setInformesOpen] = useState(location.pathname.startsWith("/informes"));
  const width = collapsed ? 76 : 264;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.children) return item.children.some((c) => hasPermission(c.id));
    return hasPermission(item.id);
  }).map((item) =>
    item.children ? { ...item, children: item.children.filter((c) => hasPermission(c.id)) } : item
  );

  return (
    <aside
      style={{
        width,
        minWidth: width,
        background: COLORS.surface,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.18s ease",
        overflow: "hidden",
        height: "100vh",
      }}
    >
      <div
        style={{
          padding: collapsed ? "22px 0" : "22px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <LogoIcon size={30} />
        {!collapsed && <Wordmark size={17} />}
      </div>

      <nav className="scroll-thin" style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {visibleItems.map((item) => {
          const isParentActive = item.children && item.children.some((c) => c.path === location.pathname);
          return (
            <div key={item.id}>
              {item.children ? (
                <button
                  onClick={() => {
                    setInformesOpen((o) => !o);
                    if (collapsed) onToggleCollapse();
                  }}
                  className="nav-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    padding: collapsed ? "10px 0" : "9px 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: isParentActive ? "rgba(108,123,255,0.12)" : "transparent",
                    color: isParentActive ? COLORS.textPrimary : COLORS.textSecondary,
                    borderLeft: isParentActive && !collapsed ? `2px solid ${COLORS.brand}` : "2px solid transparent",
                  }}
                >
                  <item.icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  {!collapsed && <span style={{ fontSize: 13.5, whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{item.label}</span>}
                  {!collapsed && (
                    <ChevronDown
                      size={14}
                      style={{ transform: informesOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}
                    />
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  className="nav-item"
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    padding: collapsed ? "10px 0" : "9px 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    borderRadius: 8,
                    textDecoration: "none",
                    background: isActive ? "rgba(108,123,255,0.12)" : "transparent",
                    color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
                    borderLeft: isActive && !collapsed ? `2px solid ${COLORS.brand}` : "2px solid transparent",
                  })}
                >
                  <item.icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  {!collapsed && <span style={{ fontSize: 13.5, whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{item.label}</span>}
                  {!collapsed && item.id === "alertas" && openAlerts > 0 && (
                    <span
                      className="pulso-mono"
                      style={{ fontSize: 10.5, background: COLORS.critical, color: "#fff", borderRadius: 10, padding: "1px 6px" }}
                    >
                      {openAlerts}
                    </span>
                  )}
                </NavLink>
              )}
              {item.children && informesOpen && !collapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2, marginBottom: 2 }}>
                  {item.children.map((child) => (
                    <NavLink
                      key={child.id}
                      to={child.path}
                      className="nav-item"
                      style={({ isActive }) => ({
                        textAlign: "left",
                        padding: "8px 12px 8px 41px",
                        borderRadius: 8,
                        textDecoration: "none",
                        display: "block",
                        background: isActive ? "rgba(108,123,255,0.12)" : "transparent",
                        color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
                        fontSize: 13,
                      })}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: 12, borderTop: `1px solid ${COLORS.border}` }}>
        <button
          onClick={onToggleCollapse}
          className="nav-item"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "9px 12px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            color: COLORS.textSecondary,
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          {!collapsed && <span style={{ fontSize: 13 }}>Colapsar menú</span>}
        </button>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, padding: "8px 12px" }}>
            <Initials name={user?.name || "?"} />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</span>
              <span style={{ fontSize: 11, color: COLORS.textTertiary }}>{user?.role?.name || "Sin rol asignado"}</span>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.textTertiary, display: "flex", flexShrink: 0 }}
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
