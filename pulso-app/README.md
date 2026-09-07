# Pulso — Dashboard de control de horarios y actividad (frontend)

Panel de administración (React + Vite) para monitoreo de operadores: tiempo real, alertas,
asistencia (check-in/check-out) y actividad de aplicaciones. Consume la API de `pulso-server`
(carpeta hermana) — ya no usa datos mock locales.

## Requisitos

- Node.js 18 o superior
- El backend `pulso-server` corriendo (ver su propio README)

## Cómo correrlo local

```bash
npm install
npm run dev
```

Se levanta en `http://localhost:5173` y espera la API en `http://localhost:4000/api`.

Si tu backend corre en otro host o puerto, copiá `.env.example` a `.env` y ajustá:

```
VITE_API_URL=http://localhost:4000/api
```

Otros comandos:

```bash
npm run build     # genera la versión de producción en /dist
npm run preview   # sirve /dist localmente para probar el build
```

## Estructura del proyecto

```
pulso-app/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
└── src/
    ├── main.jsx            # punto de entrada, monta <App /> con BrowserRouter
    ├── App.jsx             # define todas las rutas
    ├── index.css           # fuentes, reset y clases utilitarias globales
    ├── theme.js            # paleta de colores, estados, severidades, nav y títulos por sección
    ├── config.js           # URL base de la API (VITE_API_URL)
    ├── api/
    │   └── client.js       # wrapper de fetch (get/post/patch/put/del)
    ├── hooks/
    │   └── useApi.js       # hook de fetch con loading/error/refetch
    ├── components/
    │   ├── Layout.jsx       # arma sidebar + topbar + página activa
    │   ├── Sidebar.jsx      # menú lateral colapsable con el desplegable de Informes
    │   ├── TopBar.jsx       # título de sección + reloj en vivo
    │   └── ui/              # piezas reutilizables (Card, StatCard, StatusPill, tablas, StateMessage, etc.)
    └── pages/
        ├── Inicio.jsx
        ├── TiempoReal.jsx
        ├── Alertas.jsx           # incluye "Marcar revisada" (PATCH real)
        ├── Empleados.jsx
        ├── Equipos.jsx
        ├── Asistencia.jsx        # botones reales de Check-in (1015) / Check-out (1025)
        ├── Actividades.jsx
        ├── Proyectos.jsx
        ├── InformesApps.jsx      # Informes → Aplicaciones
        ├── InformesWeb.jsx       # Informes → Web / Comunicación
        └── Ajustes.jsx           # apps prohibidas y token, ambos persistidos en el backend
```

## Rutas de la aplicación

| Sección | Ruta |
|---|---|
| Inicio | `/` |
| Vista en tiempo real | `/tiempo-real` |
| Alertas | `/alertas` |
| Empleados | `/empleados` |
| Equipos | `/equipos` |
| Tiempo y asistencia | `/asistencia` |
| Actividades | `/actividades` |
| Proyectos | `/proyectos` |
| Informes → Aplicaciones | `/informes/aplicaciones` |
| Informes → Web / Comunicación | `/informes/web` |
| Ajustes | `/ajustes` |

## Próximos pasos sugeridos

1. Login de supervisores (hoy no hay autenticación para entrar al dashboard, solo para las
   rutas que va a usar la app de escritorio).
2. Migrar el backend de JSON a una base de datos real cuando el volumen lo justifique.
3. Construir la app de escritorio que llame a `/attendance/checkin`, `/attendance/checkout` y
   `/activities` con el token generado en Ajustes.
