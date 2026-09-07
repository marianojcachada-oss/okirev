import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { COLORS, NAV_ITEMS, SECTION_META } from "../theme";
import { useApi } from "../hooks/useApi";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

// Flatten NAV_ITEMS (including the "Informes" children) into a path -> section id map.
const PATH_TO_ID = NAV_ITEMS.reduce((acc, item) => {
  if (item.children) {
    item.children.forEach((child) => {
      acc[child.path] = child.id;
    });
  } else {
    acc[item.path] = item.id;
  }
  return acc;
}, {});

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const sectionId = PATH_TO_ID[location.pathname] || "inicio";
  const meta = SECTION_META[sectionId];
  const { data: alerts } = useApi("/alerts");
  const openAlerts = alerts ? alerts.filter((a) => a.status === "abierta").length : 0;

  return (
    <div className="pulso-root" style={{ display: "flex", height: "100vh", background: COLORS.bg, color: COLORS.textPrimary, overflow: "hidden" }}>
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} openAlerts={openAlerts} />
      <main className="scroll-thin" style={{ flex: 1, overflowY: "auto" }}>
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        <div style={{ padding: "0 32px 40px" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
