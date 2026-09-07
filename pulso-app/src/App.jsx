import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import TiempoReal from "./pages/TiempoReal";
import Alertas from "./pages/Alertas";
import Empleados from "./pages/Empleados";
import Equipos from "./pages/Equipos";
import Asistencia from "./pages/Asistencia";
import Actividades from "./pages/Actividades";
import Catalogo from "./pages/Catalogo";
import Proyectos from "./pages/Proyectos";
import InformesApps from "./pages/InformesApps";
import InformesWeb from "./pages/InformesWeb";
import Ajustes from "./pages/Ajustes";
import { useAuth } from "./auth/AuthContext";
import { COLORS } from "./theme";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.textSecondary, fontSize: 13.5 }}>
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/tiempo-real" element={<TiempoReal />} />
        <Route path="/alertas" element={<Alertas />} />
        <Route path="/empleados" element={<Empleados />} />
        <Route path="/equipos" element={<Equipos />} />
        <Route path="/asistencia" element={<Asistencia />} />
        <Route path="/actividades" element={<Actividades />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/proyectos" element={<Proyectos />} />
        <Route path="/informes/aplicaciones" element={<InformesApps />} />
        <Route path="/informes/web" element={<InformesWeb />} />
        <Route path="/ajustes" element={<Ajustes />} />
      </Route>
    </Routes>
  );
}
