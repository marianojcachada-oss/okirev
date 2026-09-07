# OKlrev API — backend

API en Node + Express que ahora guarda todo en **Postgres (vía Supabase)**, en vez del archivo
JSON de las entregas anteriores. Las rutas (`/api/...`) son exactamente las mismas — el
frontend y la app de escritorio no necesitan ningún cambio.

## Requisitos

- Node.js 18 o superior
- Un proyecto de Supabase (gratis) — ver más abajo

## Configuración inicial (una sola vez)

1. Creá un proyecto en [supabase.com](https://supabase.com) (gratis).
2. En la página del proyecto, hacé clic en el botón verde **"Connect"** (arriba de todo).
   Elegí la pestaña **"Session pooler"** — no "Direct connection" (esa requiere IPv6, que la
   mayoría de las redes hogareñas/oficina no soportan).
3. Copiá `.env.example` a un archivo nuevo llamado `.env` y pegá ahí ese connection string,
   reemplazando `[YOUR-PASSWORD]` por la contraseña real de tu base de datos:

   ```
   DATABASE_URL=postgresql://postgres:TU-PASSWORD@db.TU-PROYECTO.supabase.co:5432/postgres
   ```

   El archivo `.env` **no se comparte ni se sube a ningún lado** — es solo tuyo, local.

4. En Supabase, abrí **SQL Editor** y corré, en este orden:
   - Todo el contenido de `schema.sql` (crea las tablas).
   - Todo el contenido de `seed.sql` (carga los datos de ejemplo — opcional, pero recomendado
     para ver el dashboard con contenido la primera vez).

## Cómo correrlo local

```bash
npm install
npm run dev
```

Levanta en `http://localhost:4000`. Probalo con:

```bash
curl http://localhost:4000/api/health
```

Debería devolver `{"ok":true,"database":"connected"}`. Si dice `"database":"unreachable"`,
revisá que `DATABASE_URL` en tu `.env` esté bien copiado.

## Qué cambió respecto a la versión con archivo JSON

- Los datos viven en Supabase (Postgres), no en un archivo local — **ya no se pierden cada vez
  que extraés un zip nuevo**.
- Los reportes (`/reports/apps`, `/reports/web`, `/reports/activity-chart`) ahora se calculan
  con consultas SQL reales sobre la tabla `activities`, en vez de ser datos fijos de ejemplo.
  Al principio van a verse "vacíos" o con poca info hasta que la app de escritorio empiece a
  mandar actividad real.
- Si una consulta a la base falla, la ruta devuelve un 500 prolijo en vez de colgarse (gracias
  a `express-async-errors`).

## Estructura

```
pulso-server/
├── schema.sql             # correr una vez en el SQL Editor de Supabase
├── seed.sql               # datos de ejemplo (opcional)
├── .env.example
└── src/
    ├── index.js            # arma la app Express y monta todas las rutas
    ├── db.js               # pool de conexión a Postgres + helpers de fecha/hora (zona Atlanta)
    ├── middleware/
    │   └── deviceAuth.js    # exige el token de Ajustes en las rutas que usa la app de escritorio
    └── routes/
        ├── employees.js
        ├── teams.js
        ├── alerts.js
        ├── attendance.js    # check-in (1015) / check-out (1025), varios bloques por día
        ├── activities.js    # ingesta de actividad de la app de escritorio
        ├── projects.js
        ├── reports.js        # agregaciones SQL reales
        └── settings.js
```

## Endpoints

Sin cambios respecto a la entrega anterior — ver el detalle completo en el README anterior o
directamente en cada archivo de `src/routes/`. Todas las rutas siguen empezando con `/api`.

## Reiniciar los datos de ejemplo

Como los datos ahora viven en Supabase, para "resetear" hay que borrar y recrear las tablas
(`schema.sql`) y volver a correr `seed.sql` desde el SQL Editor — no hay ningún archivo local
que editar a mano.
