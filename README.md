# OKlrev

Plataforma de control horario y productividad para equipos operativos (inspirada en
Insightful), hecha a medida. Los operadores marcan su jornada y break desde una app de
escritorio; los supervisores ven todo reflejado en un panel web en tiempo real.

## Las tres partes

```
pulso-tracker/    # App de escritorio (Electron) — la instala cada operador en su compu
pulso-server/     # Backend (Node + Express + Postgres/Supabase) — la única fuente de verdad
pulso-app/        # Panel web (React + Vite) — lo que ven los supervisores/administradores
pulso-browser-extension/  # Extensión de navegador opcional, para detectar sitios web
```

**Cómo se relacionan:** cada operador abre **pulso-tracker** en su computadora, marca
check-in (código 1015) y check-out (1025), y de fondo la app va registrando qué aplicación
tiene en primer plano y si hay inactividad de mouse/teclado. Todo eso viaja a **pulso-server**,
que es quien de verdad guarda los datos (en una base Postgres alojada en Supabase). El panel
(**pulso-app**) le pregunta a ese mismo servidor para mostrarle a los supervisores empleados,
equipos, alertas y actividad — el panel en sí no guarda nada, solo refleja lo que hay en el
servidor.

## Dónde vive cada cosa hoy

| Parte | Dónde corre | Tipo de servicio |
|---|---|---|
| pulso-server | Render | Web Service (Node, siempre corriendo) |
| pulso-app | Render | Static Site (archivos ya armados) |
| Base de datos | Supabase | Postgres administrado |
| pulso-tracker | Cada compu de operador | Instalado con un `.exe` (no vive en internet) |

El servidor en el plan gratuito de Render se "duerme" después de 15 minutos sin uso — el
primer pedido después de eso tarda 30-60 segundos en responder mientras se despierta. No
afecta los datos, solo la velocidad de esa primera respuesta.

## Empezar de cero (setup local)

1. **Base de datos**: creá un proyecto en [supabase.com](https://supabase.com), entrá al SQL
   Editor, y corré todo `pulso-server/schema.sql`. Es seguro correrlo las veces que quieras —
   no borra ni duplica nada si ya existe.
2. **Variables de entorno**: en `pulso-server/`, creá un archivo `.env` (copiá
   `.env.example`) con `DATABASE_URL` apuntando a tu proyecto de Supabase (usá la cadena del
   "Session pooler", no la de conexión directa).
3. **Instalar todo**: desde la carpeta raíz,
   ```bash
   npm install
   npm run install:all
   ```
4. **Levantar servidor + panel juntos**:
   ```bash
   npm run dev
   ```
   Esto prende `pulso-server` (puerto 4000) y `pulso-app` (puerto 5173) a la vez.
5. **Hacerte administrador**: como todo pide login, necesitás que tu propio usuario tenga el
   rol Administrador. En el SQL Editor de Supabase:
   ```sql
   update employees set role_id = 'r_admin' where username = 'tu_usuario';
   ```
6. **La app de escritorio se prueba aparte** (no es un servidor web):
   ```bash
   cd pulso-tracker
   npm install
   npm start
   ```

## Funciones principales

### pulso-tracker (app de escritorio)
- Login real por usuario/contraseña (no hay recuperación propia — solo un admin puede
  reasignar contraseñas desde el panel).
- Check-in / check-out (1015 / 1025), con varios bloques por día por persona.
- Botón **10-31** para breaks: cuenta regresiva, timbre sonoro al agotarse el tiempo, no
  detiene el contador de jornada. El tiempo permitido se configura por empresa, por grupo, o
  individual por empleado.
- Detección de actividad: qué aplicación está en primer plano (vía PowerShell, sin capturar lo
  que se escribe) e inactividad de mouse/teclado.
- Detección de sitio web real (no solo el título de la ventana) vía la extensión de navegador
  + un pequeño servidor puente local.
- Se puede minimizar a la bandeja del sistema, y tiene un modo compacto que deja solo el botón
  de jornada, el de 10-31 y el contador.
- Botón "Abrir panel" que loguea automáticamente al operador en el navegador (sin pedirle
  usuario/contraseña de nuevo).
- Reporta el nombre de la computadora (hostname) en cada login, para que un admin pueda ver
  desde qué máquinas se conectó cada operador.

### pulso-server (backend)
- Autenticación por sesión (token con vencimiento de 30 días), separada del token de
  dispositivo que usa el tracker para sus propias rutas.
- **Roles y permisos** por página del panel, incluyendo un permiso "solo lo propio" para
  Actividades (un rol restringido puede ver su propia actividad pero no la de otros,
  reforzado del lado del servidor, no solo escondido en el menú).
- Empleados, Equipos, Roles y Grupos de configuración de trackeo con CRUD completo.
- Catálogo de aplicaciones: se auto-registran las apps detectadas, un admin las clasifica como
  Productiva / Neutral / Improductiva, y **reclasificar retroactivamente actualiza todo el
  historial ya cargado** (Actividades, Empleados, Informes) — no hace falta que la actividad se
  vuelva a registrar.
- Alertas automáticas cuando el tracker detecta inactividad prolongada (umbral configurable).
- Carga manual de bloques de asistencia completos, restringida a administradores, para cuando
  un empleado se olvida de prender la app.

### pulso-app (panel web)
- Login propio del panel (mismas credenciales que el tracker), con el menú lateral filtrado
  según el rol de quien entra.
- **Inicio**: resumen general y gráfico de actividad del día.
- **Vista en tiempo real** y **Equipos**: estado en vivo de cada operador (Activo / En break /
  Inactivo), con la misma vista disponible filtrada por equipo.
- **Empleados**: alta/edición/borrado, asignación de rol, equipo, y configuración de trackeo;
  desglose preciso de horas (formato "Xh Ym") por Trabajado / Productivo / Improductivo /
  Neutral / Inactivo / Break; lista de computadoras usadas por cada uno.
- **Tiempo y asistencia**: filtros de rango de fecha, y carga manual de bloques (solo admins).
- **Actividades**: filtros de fecha (incluyendo rangos de meses), selector de un empleado
  específico con línea de tiempo día por día, y el detalle de abajo sumado por
  aplicación en vez de un log interminable de eventos sueltos.
- **Catálogo de apps**, **Proyectos**, **Informes** (apps y web), **Ajustes** (empresa, roles,
  grupos de configuración de trackeo).

## Generar el instalador de Windows

```bash
cd pulso-tracker
npm run dist:win
```

Genera `pulso-tracker/release/OKlrev Tracker Setup X.X.X.exe` — ese único archivo es lo que
se le pasa a cada operador para instalar. Subí el número de versión en `package.json` antes de
cada tanda nueva, para poder diferenciar qué build tiene instalado cada uno.

## Migraciones de base de datos

`schema.sql` es siempre la versión completa y más actual — correrlo alcanza para una base
nueva o una ya existente (es seguro repetirlo). Los archivos `migration-00X-*.sql` documentan
los cambios incrementales que se fueron sumando a lo largo del proyecto, por si preferís
aplicar solo lo que te falta en vez de correr todo `schema.sql` de nuevo.
