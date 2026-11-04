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

Staging autorizado para revisión en `https://manzanas.ganamosclub.net`, con sesión y etiqueta de entorno de pruebas. URL confirmada; publicación y verificación externa pendientes al redactar este documento. Rama de trabajo: `phase-2/inventario-staging`.

## Restricciones

Sin despliegue de producción, sin tocar otros proyectos del VPS, sin facturación, cobranza, WhatsApp ni BCV en vivo. Staging usa base y recursos propios, HTTPS y acceso por invitación. No hay registro público, roles diferenciados ni operaciones sin conexión. Las modificaciones de infraestructura compartida requieren la aprobación específica del propietario.

Formularios accesibles con teclado, errores accionables y reintentos sin duplicados. Las cantidades desconocidas se muestran como desconocidas; las cajas abiertas y su contenido no se suman dos veces. Una corrección conserva el historial mediante un nuevo movimiento.
