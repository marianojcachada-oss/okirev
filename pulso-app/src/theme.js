import {
  LayoutDashboard, Activity, Bell, Users, Users2, Clock, ListChecks,
  FolderKanban, BarChart2, Settings, AlertTriangle, AlertCircle, CheckCircle2, LibraryBig,
} from "lucide-react";

export const COLORS = {
  bg: "#12141A",
  surface: "#1B1E27",
  surfaceHover: "#232733",
  border: "#2A2E3A",
  textPrimary: "#F1F2F4",
  textSecondary: "#9498A6",
  textTertiary: "#6B6F7D",
  live: "#2DD4A7",
  warn: "#F5A623",
  critical: "#F0555A",
  brand: "#6C7BFF",
};

export const STATUS_META = {
  activo: { label: "Activo", color: COLORS.live },
  pausa: { label: "En pausa", color: COLORS.warn },
  inactivo: { label: "Inactivo", color: COLORS.textTertiary },
  ausente: { label: "Ausente", color: COLORS.critical },
};

// Collapsed 3-state view used specifically by "Vista en tiempo real" and "Equipos":
// activo -> Activo, pausa (10-31 en curso) -> En break, todo lo demás -> Inactivo
// (finalizó jornada, no marcó check-in, o el tracker detectó inactividad de mouse/teclado).
export const REALTIME_GROUPS = {
  activo: { id: "activo", label: "Activo", color: COLORS.live },
  break: { id: "break", label: "En break", color: COLORS.warn },
  desconectado: { id: "desconectado", label: "Inactivo", color: COLORS.critical },
};

export function realtimeGroupFor(status) {
  if (status === "activo") return REALTIME_GROUPS.activo;
  if (status === "pausa") return REALTIME_GROUPS.break;
  return REALTIME_GROUPS.desconectado; // inactivo | ausente
}

export const SEVERITY_META = {
  critica: { label: "Crítica", color: COLORS.critical, Icon: AlertCircle },
  advertencia: { label: "Advertencia", color: COLORS.warn, Icon: AlertTriangle },
  info: { label: "Informativa", color: COLORS.brand, Icon: CheckCircle2 },
};

// path: route used by react-router. id: kept for matching alert badges, etc.
export const NAV_ITEMS = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard, path: "/" },
  { id: "tiempo-real", label: "Vista en tiempo real", icon: Activity, path: "/tiempo-real" },
  { id: "alertas", label: "Alertas", icon: Bell, path: "/alertas" },
  { id: "empleados", label: "Empleados", icon: Users, path: "/empleados" },
  { id: "equipos", label: "Equipos", icon: Users2, path: "/equipos" },
  { id: "asistencia", label: "Tiempo y asistencia", icon: Clock, path: "/asistencia" },
  { id: "actividades", label: "Actividades", icon: ListChecks, path: "/actividades" },
  { id: "catalogo", label: "Catálogo de apps", icon: LibraryBig, path: "/catalogo" },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban, path: "/proyectos" },
  {
    id: "informes", label: "Informes", icon: BarChart2,
    children: [
      { id: "informes-apps", label: "Aplicaciones", path: "/informes/aplicaciones" },
      { id: "informes-web", label: "Web / Comunicación", path: "/informes/web" },
    ],
  },
  { id: "ajustes", label: "Ajustes", icon: Settings, path: "/ajustes" },
];

export const SECTION_META = {
  inicio: { title: "Inicio", subtitle: "Resumen general de la operación de hoy" },
  "tiempo-real": { title: "Vista en tiempo real", subtitle: "Estado actual de cada operador conectado" },
  alertas: { title: "Alertas", subtitle: "Eventos que requieren revisión de un supervisor" },
  empleados: { title: "Empleados", subtitle: "Directorio y estado de cada persona" },
  equipos: { title: "Equipos", subtitle: "Desempeño agrupado por equipo" },
  asistencia: { title: "Tiempo y asistencia", subtitle: "Registros de check-in y check-out del turno" },
  actividades: { title: "Actividades", subtitle: "Registro detallado de uso de aplicaciones" },
  catalogo: { title: "Catálogo de apps", subtitle: "Clasificá cada aplicación y sitio detectado" },
  proyectos: { title: "Proyectos", subtitle: "Horas y avance por proyecto" },
  "informes-apps": { title: "Aplicaciones", subtitle: "Ranking de uso de software durante la semana" },
  "informes-web": { title: "Web y comunicación", subtitle: "Uso de sitios y herramientas de mensajería" },
  ajustes: { title: "Ajustes", subtitle: "Configuración general de la cuenta y del monitoreo" },
};
