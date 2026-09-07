# Pulso Tracker — app de escritorio para operadores

App de Electron bien simple: el operador elige su nombre una vez, y después solo tiene un
botón para marcar **Check-in (código 1015)** y **Check-out (código 1025)**. Ve sus bloques de
trabajo de hoy (como en Insightful) y puede abrir el panel de administración con un clic.

⚠️ **Importante sobre la identidad del operador:** esta versión no tiene login real. La
pantalla de configuración inicial deja elegir cualquier nombre de una lista — no valida
contraseña ni PIN. Es una simplificación intencional para esta primera versión; cualquiera
que use la computadora podría marcar en nombre de otra persona. Si esto es un problema para
tu empresa, el siguiente paso natural es agregar un PIN o usuario/contraseña por operador
antes de repartir la app.

## Requisitos para desarrollar/probar

- Node.js 18 o superior
- El backend `pulso-server` corriendo (esta app le habla directamente)

## Probarla en tu máquina (sin instalar nada)

```bash
npm install
npm start
```

Abre la ventana de la app directamente, sin necesidad de empaquetarla.

## Generar el instalador de Windows

```bash
npm run dist:win
```

Esto genera un instalador `.exe` en la carpeta `release/`. Está configurado como **NSIS
por-usuario** (`perMachine: false`), lo que significa:

- Se instala en la carpeta del usuario actual (`%LOCALAPPDATA%`), **no en Archivos de
  Programa**.
- **No pide permisos de administrador** ni dispara el control de cuentas de usuario (UAC) de
  Windows — así lo pueden instalar los operadores con su cuenta normal.

> **Nota sobre dónde correr esto:** para generar el `.exe` de Windows sin firmar, lo más
> confiable es correr `npm run dist:win` **en una máquina Windows** (o en un runner de CI con
> Windows, como GitHub Actions). Cross-compilar un instalador NSIS desde Linux es posible con
> herramientas adicionales (Wine) pero no es lo más estable; si estás en Windows, simplemente
> corré el comando de arriba ahí.

## Si tu npm bloquea los scripts de instalación

Igual que pasó con `esbuild` en el frontend: `electron` necesita bajar su binario real durante
la instalación. Si tu `npm install` te avisa que bloqueó el script de `electron`, corré:

```bash
npm install-scripts approve electron
npm install
```

Sin eso, `npm start` va a fallar porque Electron no tiene su ejecutable.

## Estructura

```
pulso-tracker/
├── package.json          # incluye la config de electron-builder (build.nsis)
└── src/
    ├── main.js            # proceso principal: crea la ventana, maneja config local
    ├── preload.js         # puente seguro entre la ventana y Node (contextBridge)
    ├── store.js           # guarda la config (apiUrl, operador elegido) en un JSON local
    └── renderer/
        ├── index.html      # pantalla de configuración + pantalla principal
        ├── style.css       # mismos colores/tipografías que el dashboard (marca Pulso)
        └── app.js          # toda la lógica: setup, timer en vivo, check-in/out, bloques
```

## Qué trackea mientras la jornada está iniciada

Además de check-in/check-out, mientras el operador tiene la jornada iniciada la app:

- **Detecta inactividad** usando la API nativa de Electron (`powerMonitor.getSystemIdleTime()`).
  No hay ninguna librería de "keylogger" instalada — esto mide *hace cuánto* no hubo
  movimiento de mouse/teclado, nunca *qué* se tipeó. Pasado el umbral configurado en Ajustes
  (`idleThresholdMinutes`), marca al operador como inactivo.
- **Detecta la aplicación en primer plano** (nombre del proceso + título de la ventana) cada
  10 segundos, usando un script de PowerShell que llama a la API `GetForegroundWindow` de
  Windows — **sin ninguna librería nativa de npm**. Esto fue intencional: evita repetir los
  mismos problemas de instalación de binarios que tuvimos con Electron.
- Compara ese texto contra la lista de "Aplicaciones prohibidas" de Ajustes (coincidencia por
  substring, sin distinguir mayúsculas) para categorizar cada bloque como Productiva / No
  productiva / Inactivo, y lo manda a `POST /api/activities`.
- Solo funciona en Windows (`process.platform === "win32"`); en otras plataformas esta función
  puntual queda inactiva sin romper el resto de la app.

### Aviso sobre antivirus / EDR corporativo

Llamar a APIs de Windows desde PowerShell con `Add-Type`/`DllImport` es una técnica legítima y
común, pero algunos antivirus o EDR la marcan como sospechosa por patrón, sin importar qué API
puntual se use. Si tu empresa tiene un antivirus centralizado, probablemente haya que agregar
`Pulso Tracker` a la lista de excepciones — lo mismo que habría que hacer con cualquier
software de monitoreo, sea cual sea su implementación.

## Cómo funciona la config local

La primera vez que se abre, guarda un archivo `pulso-config.json` en la carpeta de datos de
la app de Windows (por operador/computadora) con:

```json
{
  "apiUrl": "http://localhost:4000/api",
  "dashboardUrl": "http://localhost:5173",
  "employeeId": "e5",
  "employeeName": "Sofía Bianchi"
}
```

En producción, `apiUrl` va a apuntar al servidor real de la empresa (no a `localhost`), así
que antes de repartir la app entre los operadores hay que decidir dónde va a vivir
`pulso-server` (un servidor de la empresa, una VM, etc.) y usar esa URL.
