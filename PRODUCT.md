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

V4 quedó verificada en staging con código `53aeff14b981c52417d97c257f5be3ba1dd9d45f`. La continuación V4.2 se desarrolla en `feature/recepcion-rapida-v4-2`: permite escoger mercancía habitual sin crear decenas de combinaciones, recibe varias líneas con proveedor opcional y número automático, y exige costo real o aceptación explícita del anterior. La regla confirmada de manzana tradicional es cuatro blísteres hasta calibre100 inclusive y cinco a partir de los superiores; no se aplica a otros productos. Su implementación o pruebas no significan publicación real. No incluye regularizar automáticamente registros históricos.

## Operación e integridad

Catálogo con variedad/calibre opcionales y empaques confirmados de caja completa, mitades comerciales o blíster. Recepción multilínea con costo histórico y precios promocional/regular por presentación. Inventario físico único, costo conservativo y asignación FIFO transaccional al vender. Clientes, precios pactados, crédito sin abono inicial, reparto explícito de abonos, vencimientos y recordatorios independientes, historial y comprobantes comerciales PDF.

Las operaciones internas requieren sesión, origen válido, idempotencia y controles PostgreSQL. Una respuesta perdida debe poder recuperarse sin duplicar mercancía, ventas o pagos. WhatsApp consulta el saldo actual antes de abrir el chat. Push requiere opt-in de una sola tablet y solo considera crédito pendiente; la prueba física del dispositivo se registra por separado.

## Acuerdo comercial del hotfix V3

El precio se pacta al crear la venta y no cambia al abonar, tanto en contado como a crédito. La lista promocional establece un acuerdo en divisa: USD y USDT se reciben 1:1; para cobrar en bolívares se usa una cotización vigente de compra USDT de Binance P2P. La lista regular establece el acuerdo BCV para cobros en bolívares. Los documentos históricos conservan su criterio anterior.

Las cotizaciones se verifican en el servidor, se guardan como historial y se identifican en el cobro. Sin una cotización válida se bloquea únicamente el cobro VES que la necesita. No se acepta una tasa escrita por el navegador ni se cambia una conversión ya registrada. Estas reglas corresponden al hotfix en QA/staging, no describen una actualización ya publicada de producción. Detalles y fuentes: [reglas del dominio](docs/domain-rules.md).

## Marca y experiencia

Logo original intacto, verde bosque, rojo manzana y crema. Formularios con campos pertinentes a la tarea, cantidades desconocidas explícitas, teclado y foco visibles, animaciones breves con reducción de movimiento. Una animación nunca confirma una operación antes de la respuesta del servidor. «Agregar producto» reúne fruta, variedad, calibre y empaque en un solo recorrido; contado cobra el total y crédito muestra solo los datos necesarios para el saldo pendiente.

## Límites y validación pendiente

Los PDF son comprobantes comerciales, no facturas fiscales SENIAT. No se inventan blísteres, peso, precios, stock, teléfono, banco o modalidad de cobro. Los métodos habilitados en V3 son efectivo USD, transferencia USDT y bolívares genérico; otros requieren confirmación comercial. No hay pagos por cero, venta por pieza, mensajes autónomos ni operaciones comerciales sin conexión.

Se mantienen pendientes las confirmaciones de empaque particulares del negocio, el recorrido físico Android y las futuras notas de entrega en blanco y negro con prueba en HP Smart Tank 215. La emulación de pantalla no sustituye el dispositivo. La [prueba manual de cinco minutos](docs/hotfix-ux-v3-checklist.md) está preparada para QA. El despliegue del hotfix en producción y cualquier modificación de datos reales o infraestructura compartida requieren su autorización específica y evidencia de respaldo/restauración.
