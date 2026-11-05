# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, Next.js, React, NestJS, PostgreSQL, Drizzle, Docker Compose, Vitest y Playwright.

## Usuarios y propósito

Distribuidora venezolana de frutas importadas. Los operadores registran mercancía, consultan existencias, venden y cobran desde teléfono, tablet o computadora. La cobranza se centraliza en una tablet Android con WhatsApp corporativo. Los socios pueden explorar la demo sintética sin cuenta o entrar con acceso privado.

## Alcance de fase 3

Catálogo con variedad/calibre opcionales; empaques con blíster, mitades comerciales o cajas completas. Recepción multilínea con costo histórico y precios promocional/normal independientes por presentación. Inventario físico único, costo conservativo y asignación FIFO transaccional al vender. Clientes, precios negociados, crédito sin pago inicial, reparto explícito de abonos, vencimientos y recordatorios diferenciados, historial y comprobantes comerciales PDF.

Demo pública estática en `/demo`, sin datos ni sesiones privadas. Operaciones internas con sesión, validación de origen, idempotencia y controles PostgreSQL. WhatsApp abre un chat con mensaje y saldo actual para envío manual. Push requiere opt-in de una sola tablet y configuración VAPID; falta la prueba física del dispositivo.

## Marca y experiencia

Logo original intacto, verde bosque, rojo manzana y crema. Formularios contextuales, cantidades desconocidas explícitas, teclado y foco visibles, animaciones breves con reducción de movimiento. Una animación nunca confirma una operación antes de la respuesta del servidor.

## Límites

Los PDF son comprobantes comerciales, no facturas fiscales SENIAT. BCV permanece no disponible mientras no exista verificación oficial vigente; se bloquea VES sin impedir USD. Sin tasa paralela, pago por cero, venta por pieza, mensajes autónomos ni operaciones comerciales sin conexión.

Pendientes: blíster por variedad/calibre, Lady/Pink Lady, media caja de pera, mandarina y condiciones particulares de devoluciones. No se inventan esos datos.

Autorizados implementación y staging, sin merge ni producción. Evidencia y release: [staging](docs/staging.md) y [entrega](docs/entrega-fase-3.md). Antes de producción faltan respaldo fuera del VPS, evaluación fiscal y pruebas reales. Cualquier cambio de infraestructura compartida requiere autorización específica.
