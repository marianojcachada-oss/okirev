# Pulso — proyecto completo

Tres carpetas que trabajan juntas:

```
pulso-server/    # backend (Node + Express + JSON) — la fuente de verdad de los datos
pulso-app/       # frontend (React + Vite) — el dashboard que usan los supervisores
pulso-tracker/   # app de escritorio (Electron) — la que instalan los operadores
```

Cómo se relacionan: **pulso-tracker** (en la compu de cada operador) marca check-in/check-out
llamando a **pulso-server**. **pulso-app** (el dashboard) lee esos mismos datos de
**pulso-server** para mostrárselos a los supervisores. El servidor es el único que guarda
información — los otros dos son clientes.

## Antes de arrancar: configurar Supabase

Desde esta entrega, `pulso-server` guarda todo en Postgres (vía Supabase) en vez de un archivo
local. Tenés que crear un proyecto de Supabase y correr `schema.sql` + `seed.sql` ahí antes de
levantar el backend por primera vez — el detalle paso a paso está en `pulso-server/README.md`.

## Desarrollo local — backend + dashboard con un solo comando

```bash
npm install
npm run dev
```

Esto instala `concurrently` en la raíz y levanta **pulso-server** (puerto 4000) y **pulso-app**
(puerto 5173) juntos, cada uno con su color en la terminal. La primera vez también necesitás
instalar las dependencias de cada subproyecto:

```bash
npm run install:all
```

(o entrás a cada carpeta y corrés `npm install` vos mismo, como veníamos haciendo).

## La app de escritorio (pulso-tracker) se prueba aparte

No entra en el `npm run dev` de arriba porque es una app de Electron, no un servidor web.
Para probarla:

```bash
cd pulso-tracker
npm install
npm start
```

Mirá `pulso-tracker/README.md` para cómo generar el instalador `.exe` de Windows.

## Si ya tenías `pulso-app` y `pulso-server` de una entrega anterior

Extraé este zip sobre la carpeta donde ya los tenías (por ejemplo `Taxi laser/pulso/`). Va a:

- Actualizar `pulso-app` y `pulso-server` con los cambios de esta entrega (bloques múltiples
  de check-in/check-out por día, como en Insightful).
- Agregar `pulso-tracker/` como carpeta nueva.
- Agregar `package.json` y este `README.md` en la raíz, para el comando único.

`node_modules` no viene incluido en ningún lado — después de extraer, corré
`npm run install:all` (o instalá cada carpeta a mano) antes de levantar todo.

## Qué cambió en esta entrega

- **Backend:** el check-in/check-out ahora admite **varios bloques por día** por persona
  (antes era uno solo). Cada Check-in abre un bloque nuevo; el Check-out cierra el más
  reciente. Se agregó `GET /attendance/today/:employeeId` para que la app de escritorio pida
  solo los bloques de su propio operador. También se agregó `idleThresholdMinutes` a Ajustes.
- **Dashboard:** la página de Tiempo y asistencia ahora muestra esos bloques múltiples, y
  Ajustes permite configurar los minutos de inactividad antes de marcar a alguien inactivo.
- **`pulso-tracker` ahora trackea actividad real**, no solo check-in/check-out: detecta
  inactividad de mouse/teclado (sin capturar contenido) y qué aplicación está en primer plano,
  categorizando contra la lista de apps prohibidas. Ver el README de `pulso-tracker` para el
  detalle técnico y el aviso sobre antivirus corporativo.

## Próximos pasos sugeridos

1. Reemplazar la pantalla de "elegí tu nombre" de `pulso-tracker` por un login real (PIN o
   usuario/contraseña por operador) antes de repartirla en serio.
2. Decidir dónde va a vivir `pulso-server` en producción (no puede ser `localhost` si los
   operadores están en otras computadoras) y actualizar la URL de la API en `pulso-tracker` y
   `pulso-app` en consecuencia.
3. Migrar el backend de JSON a una base de datos real cuando el volumen lo justifique.
