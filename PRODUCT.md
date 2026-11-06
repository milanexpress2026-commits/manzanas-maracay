# Producto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, Next.js, React, NestJS, PostgreSQL, Drizzle, Docker Compose, Vitest y Playwright.

## Usuarios y propósito

Distribuidora venezolana de frutas importadas. Los propietarios y operadores registran mercancía, consultan existencias, venden y cobran desde teléfono, tablet o computadora. La cobranza utiliza el WhatsApp corporativo del dispositivo; abrir un mensaje requiere una acción del operador y enviarlo sigue siendo manual.

## Estado publicado y trabajo actual

La fase 4 está activa en producción con acceso privado, base separada y operación en USD. El código publicado de referencia es `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`; su evidencia está en la documentación de fase 4. La demo sintética permanece fuera de las rutas de producción. El acceso compartido de los propietarios ofrece «Mantener sesión activa» durante 30 días y cierre de sesión revocable.

La inspección de solo lectura del 6 de noviembre de 2026 confirmó producción `2a81817` con trece migraciones y staging V4.2 `80b186f` con quince. V4.5 se trabaja en `feature/operacion-simple-v4-5`: recibir cantidades sin costos ni listas, escribir el precio en cada venta y elegir el acuerdo/método de cobro. Sus pruebas e implementación se registran separadamente del despliegue; no implican publicación real ni regularización automática de historia.

## Operación e integridad

Catálogo habitual virtual completo, sin sembrar stock: manzanas tradicionales y tres graneles separados, peras Forelle/Packham, kiwi, uvas, otras frutas y cuatro alimentos de unidad comercial por confirmar. Manzana tradicional100 lleva cuatro blísteres; peras125 cuatro y135/150/165 cinco. Empaque desconocido solo bloquea la operación que lo necesita. Recepción multilínea con proveedor opcional, número automático y sin campos de costo/precio. Se escribe el precio positivo de cada venta sin lista previa. Inventario físico único, FIFO transaccional, clientes, crédito sin abono, reparto explícito, vencimientos/recordatorios independientes y PDF comerciales.

El costo no recolectado permanece NULL y no impide mover cantidades. Los importes históricos conocidos se conservan internamente; la interfaz operativa no ofrece COGS, margen o utilidad. No se inventa costo cero ni precio de referencia. Cada venta conserva su precio manual y acuerdo; otra venta no los cambia.

Las operaciones internas requieren sesión, origen válido, idempotencia y controles PostgreSQL. Una respuesta perdida debe poder recuperarse sin duplicar mercancía, ventas o pagos. WhatsApp consulta el saldo actual antes de abrir el chat. Push requiere opt-in de una sola tablet y solo considera crédito pendiente; la prueba física del dispositivo se registra por separado.

## Acuerdo comercial del hotfix V3

El precio manual se pacta al crear la venta y no cambia al abonar. El acuerdo divisa recibe USD/USDT1:1 o bolívares a Binance compra. El acuerdo BCV recibe USD/USDT1:1 o bolívares a BCV oficial. El acuerdo es explícito e independiente de contado/crédito. La referencia opcional en Bs. de un pago USDT es informativa y se conserva separada: no registra un pago VES. Los documentos históricos mantienen su criterio anterior.

Las cotizaciones se verifican en el servidor, se guardan como historial y se identifican en el cobro. Sin una cotización válida se bloquea únicamente el cobro VES que la necesita. No se acepta una tasa escrita por el navegador ni se cambia una conversión ya registrada. Estas reglas corresponden al hotfix en QA/staging, no describen una actualización ya publicada de producción. Detalles y fuentes: [reglas del dominio](docs/domain-rules.md).

## Marca y experiencia

Logo original intacto, verde bosque, rojo manzana y crema. Formularios con campos pertinentes a la tarea, cantidades desconocidas explícitas, teclado y foco visibles, animaciones breves con reducción de movimiento. Una animación nunca confirma una operación antes de la respuesta del servidor. «Agregar producto» reúne fruta, variedad, calibre y empaque en un solo recorrido; contado cobra el total y crédito muestra solo los datos necesarios para el saldo pendiente.

## Límites y validación pendiente

Los PDF son comprobantes comerciales, no facturas fiscales SENIAT. No se inventan blísteres, peso, precios, stock, teléfono, banco o modalidad de cobro. Los métodos habilitados en V3 son efectivo USD, transferencia USDT y bolívares genérico; otros requieren confirmación comercial. No hay pagos por cero, venta por pieza, mensajes autónomos ni operaciones comerciales sin conexión.

Se mantienen pendientes los empaques particulares no confirmados, el recorrido físico Android y la impresión real en HP Smart Tank215. La emulación no sustituye el dispositivo. Comprobantes, recibos y notas de entrega se abren como PDF mediante el dispositivo, sin una nueva salida de stock al reimprimir. El despliegue V4.5 requiere aprobación concreta del SHA/migración y evidencia de respaldo/restauración; no incluye tocar infraestructura compartida.
