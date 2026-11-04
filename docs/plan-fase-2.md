# Plan de fase 2

El propietario confirmó el 4 de noviembre de 2026 la ejecución de `docs/referencias/brief-fase-2.txt`, incluida la preparación de staging seguro. Rama: `phase-2/inventario-staging`, base revisada `6c10243c1acd3a04f35e016e650c6ba04a20bc97`.

## Punto de partida comprobado

El repositorio local y GitHub coincidían. Antes de cambiar código se ejecutaron typecheck, compilación API/web, 11 pruebas unitarias y 13 escenarios de navegador/API/PostgreSQL: todos aprobados. Playwright tardó 38,8 segundos. La base de pruebas fue `manzanas_maracay_test` y se detuvo al terminar. No había servicios de Manzanas Maracay desplegados en el VPS según la inspección previa.

## Hitos

1. Autenticación por usuarios invitados, sesiones persistidas y revocables, hash robusto, limitación de intentos y protección de pantallas y API. Configuración HTTPS obligatoria para staging; nunca reutilizar el token interno como autenticación de personas.
2. Proveedores y recepción multilínea con una instantánea inmutable del empaque y costo por lote, almacén inicial propio y auditoría de cada operación.
3. Apertura de cajas/blíster, retiros internos, conteo físico para medias cajas, ajustes justificados y reversas con eventos nuevos. Consistencia entre historial y saldos en PostgreSQL, bloqueo por lote e idempotencia.
4. Interfaz responsive con logo oficial, saldos físicos separados de equivalencias, historial por lote y marca de entorno de pruebas. Catálogo existente conservado en `/`.
5. Contenedores Docker, redes/volúmenes/secretos propios, migración restringida a bases de este proyecto, health checks, respaldo y restauración ensayada. Publicar solo si existe dominio HTTPS confirmado y ruta de proxy autorizada.
6. Pruebas de aceptación completas, capturas reales, documentación, commits y push. Nunca merge automático ni despliegue de producción.

## Decisiones de integración

- La API NestJS sigue siendo autoridad transaccional. Next.js presenta datos y actúa como proxy del mismo origen; el servidor verifica sesión y token interno.
- Cajas abiertas y blíster abiertos son recipientes, no cantidades adicionales. Las piezas desconocidas permanecen en `null`. El calibre nunca se usa como conteo.
- Preparar una media caja conserva `contadas = preparadas + restantes`; la reversa exige que no existan movimientos dependientes posteriores.
- La base de staging es exclusiva, distinta de desarrollo, pruebas automatizadas y futura producción. No se importan clientes, deudas ni inventarios reales.
- Las fuentes recibidas y las capturas conceptuales no son datos reales. Cualquier demostración se etiqueta expresamente DEMO.

## Avance comprobado

Se completaron catálogo conservado, autenticación invitada, proveedores, recepción e inventario. La validación final aprobó tipos, compilación, 23 pruebas unitarias y 32 escenarios E2E/API/PostgreSQL. Hay trece capturas locales revisadas y una captura de acceso real a staging. La rama tiene el [PR #1 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1), sin merge.

El propietario confirmó `manzanas.ganamosclub.net` y aprobó específicamente DNS y proxy. Se creó el registro A DNS only y el host de Caddy se validó y recargó. HTTPS, acceso invitado, rechazo anónimo y sesión se comprobaron externamente. El respaldo de las 20:47 UTC se restauró en un contenedor sin red y volumen propios, con limpieza aprobada.

La integración quedó verificada a las 21:08:33 UTC sobre `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`. Se resolvió una colisión del alias Docker `web` que había causado un 502 temporal en Socios: se desconectó solo la red propia, se renombró el servicio a `mm-staging-web` y se reconectó con prioridad de gateway −1, conservando las rutas previas. Cinco rondas GET comprobaron health de Manzanas 200, Socios raíz 302 y Pedal raíz 200; el smoke HTTPS completo de sesión pasó en la release corregida. La [entrega](entrega-fase-2.md) y el [registro de infraestructura](infrastructure.md) conservan la incidencia y su resolución. La URL está activa; no quedan permisos ni datos pendientes para utilizar el acceso invitado existente.

Después del cierre, corresponde revisar el flujo con el propietario e invitar individualmente a los socios cuando se reciban sus nombres de usuario. Antes de datos comerciales reales se requiere una copia segura del respaldo fuera del VPS. No se piden contraseñas por chat ni se amplía automáticamente a producción, ventas o cobranza.
