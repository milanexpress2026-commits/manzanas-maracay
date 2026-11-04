# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Solicitado: TypeScript, Next.js, React, NestJS, PostgreSQL, Drizzle, Tailwind, shadcn/ui, Docker Compose, Vitest y Playwright.

## Usuarios y propósito

Propietarios y usuarios invitados de una distribuidora venezolana de frutas importadas. Gestionan catálogo, proveedores, recepciones e inventario desde teléfono y computadora. Las ventas y la cobranza pertenecen a fases posteriores.

## Alcance y evidencia

Fase 2 autorizada el 4 de noviembre de 2026: proveedores, recepción multilínea por cajas, lotes con empaque y costo históricos, apertura y retiro de blíster, conteo de fruta, preparación de medias cajas, ajustes y reversas auditadas. El catálogo de fase 1 se conserva. Todas las pantallas operativas requieren sesión; los saldos proceden de PostgreSQL y de movimientos reales dentro del entorno correspondiente.

Cuatro imágenes conceptuales fijan identidad verde, roja y crema. No representan funciones ya construidas ni datos del negocio. El logo oficial se conserva en `apps/web/public/brand/logo-manzanas-maracay.png`. Gala 80 con 5 blíster y Gala 180 con 4 son configuraciones editables, nunca cantidades de fruta. Las muestras se identifican como DEMO; no hay ventas ni tasa BCV verificada.

Staging activo y verificado en `https://manzanas.ganamosclub.net`, con HTTPS, sesión invitada y etiqueta de entorno de pruebas. Release: `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`. Rama de trabajo: `phase-2/inventario-staging`, con [PR #1 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1). La verificación aprobó 23 pruebas unitarias, 32 E2E/API/PostgreSQL, acceso externo y restauración aislada. Una colisión de alias del proxy causó un 502 temporal en Socios; se corrigió con un nombre exclusivo y cinco rondas GET confirmaron la recuperación. La incidencia y la evidencia se conservan en la entrega.

## Restricciones

Sin despliegue de producción, sin modificar aplicaciones ajenas del VPS, sin facturación, cobranza, WhatsApp ni BCV en vivo. Staging usa base y recursos propios, HTTPS y acceso por invitación. No hay registro público, roles diferenciados ni operaciones sin conexión. La incorporación de su registro DNS y host al proxy compartido recibió aprobación específica y está completada; cualquier cambio futuro en infraestructura compartida requiere su propia revisión de alcance.

Formularios accesibles con teclado, errores accionables y reintentos sin duplicados. Las cantidades desconocidas se muestran como desconocidas; las cajas abiertas y su contenido no se suman dos veces. Una corrección conserva el historial mediante un nuevo movimiento.
