# Continuar Manzanas Maracay — V4.2

Repositorio público: [Manzanas Maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). No contiene credenciales ni datos privados.

## Estado comprobado

- Producción activa: `phase4-2a81817fe2c1`, código `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`, operación interna en USD con acceso de dueños. No suponer que sigue vacía: los propietarios volvieron a cargar datos después del reinicio autorizado.
- Staging V4 verificado: `hotfix-53aeff14b981`, código `53aeff14b981c52417d97c257f5be3ba1dd9d45f`, catorce migraciones. [Evidencia V4](catalogo-tasas-v4.md).
- V4 cerrada documentalmente en `476816f`, [PR #5](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/5). Conserva PR #1–4, sin merges ni force push.
- Trabajo vigente: `feature/recepcion-rapida-v4-2`, desde V4. La continuación corregida está autorizada para implementación y pruebas; preparar toda la promoción antes de solicitar aprobación expresa del cambio real.

Verificar siempre HEAD, release, estado del PR y evidencia más reciente. Un commit de documentación no equivale a un despliegue.

## Instrucción para continuar

Leer primero AGENTS.md, PRODUCT.md, DESIGN.md, [brief V4.2 corregido](referencias/brief-recepcion-rapida-v4-2.txt), [reglas del dominio](domain-rules.md) e [integridad de inventario](inventory-model.md). La skill local manzanas-inventory-integrity enlaza las invariantes con pruebas SQL reales.

V4.2 incorpora catálogo habitual visible y materialización transaccional solo de lo recibido; proveedor nullable real sin registro ficticio, fecha y número interno automáticos, costo inicial real y propuesta del costo anterior con aceptación explícita. La regla confirmada para manzana tradicional con blíster es calibre <=100: cuatro; >100: cinco. El calibre 100 no está pendiente. Granel y otras frutas no reciben esa regla; excepciones por lote conservan historia. Nueva migración 0014, sin modificar las catorce anteriores.

Mantener FIFO, ledger físico y de costo, snapshots inmutables, NUMERIC/Decimal, auditoría, RLS e idempotencia. Reintentar tras perder una respuesta devuelve la operación anterior antes de generar fecha, número o catálogo. Catálogo no equivale a stock; no sembrar precios, costos, clientes, proveedores ni transacciones en producción.

Conservar cuatro métodos: efectivo USD, USDT 1:1, bolívares BCV para acuerdo regular y bolívares USDT compra para acuerdo divisa. El acuerdo se fija al vender y nunca se recalcula al abonar. Las fuentes se consultan mediante recolector separado con TLS, vigencia e historial; una fuente ausente/futura/vencida bloquea solo el cobro VES dependiente. No inventar tasas ni importar fixtures de staging.

El acceso privado compartido de los dueños conserva su contraseña y «Mantener sesión activa». No publicar secretos, sesiones ni respaldos. La copia externa cifrada en esta computadora está autorizada y su restauración debe ensayarse en aislamiento.

Antes de promover: tipos, unitarias, build, E2E completos y regresiones financieras, QA de producción aislada, migraciones fresh/upgrade, respaldo recuperable, candidato exacto, diff y plan de restauración. Preparar imágenes y evidencia antes de pedir la aprobación final del apartado 8. No modificar DNS, Caddy, firewall ni otros proyectos; la actualización propia puede conservar el alias actual.

Los PDF son comerciales, no fiscales. WhatsApp se envía manualmente. Notificaciones de una tablet requieren opt-in; emulación de 390/800/1366 no demuestra operación física Android. Registrar ese límite y comprobar la versión efectiva después de publicar.
