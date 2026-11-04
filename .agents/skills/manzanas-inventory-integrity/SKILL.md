---
name: manzanas-inventory-integrity
description: Implementar o revisar cambios de catálogo comercial, recepciones, inventario, FIFO, ventas, abonos y BCV en Manzanas Maracay. Conecta las reglas del negocio con pruebas transaccionales y evidencia; no aplica a cambios exclusivamente visuales.
---

# Integridad de Manzanas Maracay

Leer primero [docs/domain-rules.md](../../../docs/domain-rules.md), fuente comercial primaria, y el apartado afectado de [inventory-model.md](../../../docs/inventory-model.md). Si un ejemplo, test viejo o esta guía contradice una regla confirmada, actualizar la evidencia y la guía; no inventar otra regla. Las configuraciones pendientes no son valores predeterminados de producción.

## Aplicación a cada cambio de dominio

1. Identificar el comando y las invariantes afectadas, incluidos sus triggers, permisos e idempotencia. Leer la migración actual; una migración aplicada no se reescribe.
2. Añadir o actualizar pruebas de comportamiento en [tests](../../../tests), con casos normales, rechazo atómico y concurrencia cuando cambie stock o dinero. Probar la conservación del estado en PostgreSQL, además de la respuesta HTTP.
3. Mantener una sola transacción para documento, libro de movimientos, proyección, costos, auditoría y respuesta idempotente. Bloquear recursos en orden consistente. No hacer red externa dentro de la transacción.
4. Ejecutar las verificaciones pertinentes y registrar comando, resultado, revisión y limitaciones en la entrega. Una lista escrita de casos no sustituye pruebas ejecutadas. Nunca afirmar que staging pasó a partir del resultado local.

## Invariantes y evidencia mínima

| Área | Invariante | Caso ejecutable que debe cubrir el cambio |
|---|---|---|
| Caja con blíster | La caja abierta es recipiente; su contenido no se suma otra vez. Calibre no es conteo. | Tres cajas de cinco blíster, retirar uno: dos cerradas y cuatro intactos; equivalencia catorce. Retirar los cuatro deja el recipiente vacío y no disponible. |
| Conteo físico | Desconocido permanece `null`; no se vende manzana por pieza. | Conteo 37, preparar 18, conservar 19; rechazar 18 + 20 sin alterar el lote. |
| Granel y kiwi | Medias comerciales sin piezas ficticias; distinguir caja sellada y media remanente. | Diez cajas granel menos una caja y una media: ocho selladas y una media, equivalencia 8,5. Kiwi: una caja de 10 kg menos media deja media de 5 kg. |
| Presentaciones | Capacidades configuradas, sin excepciones por nombre de fruta. | Uva solo caja; kiwi caja/media; manzana sin venta por pieza; pera con empaque y método pendientes bloquea únicamente operaciones que los necesitan. |
| Recepción | Una confirmación conserva costo/empaque del lote y cambia precios solo con elección explícita. | Cuatro productos: todos o ninguno; reintentar no duplica. Cambiar costo no cambia lista ni lotes anteriores. |
| FIFO y costo | Mismo stock y libro existentes; asignación de fuentes por antigüedad, costo histórico decimal conservado. | 10 cajas a 25 + 10 a 27; venta 12 a 40: costo 304, ingreso 480, bruto 176, ocho cajas del segundo lote. Abrir/fraccionar no crea costo. |
| Venta | Documento confirmado y egreso atómicos; cantidad física disponible, sin stock negativo. | Dos usuarios disputan la última caja: solo uno confirma. Reintento con misma clave produce una venta y un egreso. |
| Precios | Precio pactado e instantánea de lista independientes. | Cinco cajas a 38 suman 190; lista permanece igual. |
| Crédito y abonos | Deuda USD derivada; asignación explícita por comprobante, sin sobrepago ni asiento cero. | Crédito 200 con pago inicial cero conserva deuda 200. Deudas 200/150/100 y abono 80 al primero dejan 120/150/100 y total 370. Dos abonos simultáneos no exceden saldo. |
| BCV | Fuente oficial verificable, vigencia del cobro en servidor e historia inmutable; ningún número del navegador habilita VES. | Rechazar tasa ausente, duplicada, no oficial, no positiva, futura o vencida. El cambio de tasa no altera deuda USD; caída de fuente no bloquea USD. |
| Compensación | Historial append-only; fuentes/costos originales restaurados solo si las dependencias lo permiten. | Reversa una vez, con evento nuevo; rechazo de reversa dependiente sin cambios parciales. |
| Demo y acceso | Demo sintética separada; nunca sesión operativa anónima ni base privada pública. | `/demo` abre sin login; GET/POST/PATCH/DELETE privados rechazan visitantes; dos navegadores no comparten simulaciones editables. |

Dinero y costo usan Decimal y `numeric`; documentar escala y destino del residuo del redondeo. Fechas comerciales usan `America/Caracas`. El comprobante y el recibo son documentos comerciales, sin afirmar validez fiscal. Los recordatorios no envían WhatsApp automáticamente.

## Verificación y límites

Los comandos existentes son `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`. Seleccionar primero el escenario afectado, y ejecutar la batería exigida al cerrar el hito. La base de tests debe ser local y exclusiva; probar además migración desde fase 2 cuando cambie esquema. No borrar staging ni modificar bases ajenas para hacer pasar una prueba.

Esta skill no concede permisos para leer secretos, publicar producción, modificar proxy/DNS/redes compartidas, contratar servicios o enviar mensajes. Preserva las autorizaciones explícitas del propietario y el alcance del hito. Los datos comerciales todavía pendientes permanecen en la matriz de decisiones, sin resolverlos con fixtures DEMO.
