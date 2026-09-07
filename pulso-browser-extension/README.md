# OKlrev Tracker Companion (extensión de navegador)

Extensión chica para Chrome/Edge que le informa a **OKlrev Tracker** qué sitio tenés activo,
en tiempo real, para que el tiempo se categorice correctamente (en vez de solo saber "estás en
el navegador", sabe "estás en youtube.com").

- No hace nada visible, no agrega botones ni ventanas.
- No manda datos a ningún lado excepto a `http://localhost:17342`, que es la propia app de
  escritorio corriendo en tu misma computadora. Ningún dato sale a internet por acá.
- Si `OKlrev Tracker` no está abierto, la extensión simplemente no logra conectarse y no hace
  nada — no rompe la navegación.

## Instalar (modo desarrollador — para probarla)

1. Abrí `chrome://extensions` (o `edge://extensions` en Edge).
2. Activá "Modo de desarrollador" (interruptor arriba a la derecha).
3. Click en "Cargar descomprimida" / "Load unpacked".
4. Elegí esta carpeta (`pulso-browser-extension`).
5. Listo — no hace falta reiniciar el navegador. Cambiá de pestaña y `OKlrev Tracker` ya
   debería empezar a mostrar el sitio en su indicador "Detectando: …".

## Repartirla a todos los operadores sin modo desarrollador

Para no depender de que cada operador active el modo desarrollador a mano, hay dos caminos si
tu empresa administra las computadoras de forma centralizada:

- **Chrome Enterprise / Google Admin**: subís la extensión (empaquetada) y la forzás vía la
  política `ExtensionInstallForcelist`.
- **Microsoft Intune (para Edge)**: política equivalente para Edge administrado.

Ambos caminos requieren que la empresa ya tenga esas herramientas de administración de
dispositivos configuradas. Si no las tenés, el modo desarrollador (instalación manual, una vez
por computadora) es la alternativa más simple mientras el equipo es chico.

## Cómo funciona por dentro

- `manifest.json`: declara los permisos (`tabs`, y acceso a `localhost`).
- `background.js`: un service worker que escucha tres eventos de Chrome —cambio de pestaña,
  cambio de URL dentro de la misma pestaña, y cambio de foco entre ventanas— y en cada uno le
  manda la URL activa a `OKlrev Tracker` por HTTP local.

No hay opciones para configurar ni ningún dato que guarde — es intencionalmente mínima.
