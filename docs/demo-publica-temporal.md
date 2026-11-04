# Vista pública temporal — 4 de noviembre de 2026

Rama `phase-3/demo-publica-temporal`, basada en `f9b532b75c1ffce668571dc7db0ed20b5a52c36f`. Esta entrega agrega una portada y seis pantallas de demostración sintética mientras continúa la verificación de la fase comercial completa.

La demostración es de solo lectura y no consulta las API privadas. La operación interna de fase 2 permanece autenticada; el catálogo se encuentra en `/catalogo`. API, proxy, dependencias fijadas, esquema, migraciones y runtime no cambiaron. Los ajustes de Docker/Compose se limitan a propagar `MM_RELEASE` durante build y ejecución web para el sello visible de versión. No se ejecutaron operaciones contra PostgreSQL durante este smoke.

## Verificación ejecutada

- `npm ci`: dependencias instaladas desde el lock existente, sin modificarlo.
- `npm run typecheck`: correcto.
- `npm test`: 23 pruebas correctas.
- `npm run build`: API y Next.js correctos. `/` y los seis destinos `/demo` se generan estáticamente.
- `node tests/public-demo-smoke.mjs`: correcto. El script inicia y cierra únicamente los procesos propios en 127.0.0.1:3300 y 3301, con una dirección PostgreSQL deliberadamente desconectada y un token efímero que no imprime.
- Siete rutas públicas devuelven 200, sin solicitudes de navegador a `/api/` ni cookie de sesión.
- `/catalogo` devuelve 307 hacia `/login`; GET de catálogo, inventario y proveedores devuelve 401; POST de recepción y PATCH de configuración anónimos devuelve 401.
- 28 auditorías con axe (WCAG 2 A/AA y 2.1 AA): siete vistas a 390, 800, 1024 y 1440 px, sin hallazgos ni desbordamiento horizontal del documento.
- Diálogo de ejemplo abre y cierra por teclado, devuelve foco al botón y respeta movimiento reducido. Las tablas desplazables reciben foco y nombre accesible.

Las [14 capturas de escritorio y teléfono](capturas/demo-publica/) provienen del navegador real. En móvil, las tablas se desplazan dentro de su panel; el documento completo permanece dentro del ancho visible. Los textos pequeños de tarjetas verdes cumplen contraste y el logo conserva el arte oficial.

Para repetir el smoke, primero compilar y disponer de Chromium de Playwright en `.local/browsers` o en `PLAYWRIGHT_BROWSERS_PATH`. El resultado detallado queda en `.local/demo-smoke-result.json`. Esta evidencia es local; la publicación y sus comprobaciones externas se registran por separado.
