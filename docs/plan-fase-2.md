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

## Dependencias de infraestructura

El propietario confirmó `manzanas.ganamosclub.net`. Se comprobó el acceso a Cloudflare y la ausencia de ese registro. El servidor dispone de recursos y un proxy Caddy compartido. Se preparó un directorio privado exclusivo y una cuenta invitada; las credenciales permanecen fuera del repositorio. Antes de publicar falta validar el despliegue, ensayar su recuperación y aprobar específicamente la adición del nuevo DNS y host al proxy compartido. La ausencia de una URL no bloquea construir ni probar la fase localmente.
