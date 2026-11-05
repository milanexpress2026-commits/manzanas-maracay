# Hotfix UX V3: prueba de cinco minutos para los propietarios

**Estado: sujeto a QA.** Esta guía describe el resultado que debe comprobarse en la versión candidata. No acredita por sí sola pruebas ejecutadas ni un despliegue. El alcance autorizado del hotfix es QA/staging; no usar esta prueba para crear datos sintéticos en producción.

## Antes de empezar

Abrir el enlace de QA indicado en la entrega y comprobar su etiqueta de pruebas y la versión candidata. Usar exclusivamente un proveedor, productos y un cliente de QA identificables; el teléfono del cliente puede quedar vacío. Debe haber un proveedor de prueba disponible. Si faltan esos preparativos, hacerlos antes de contar los cinco minutos.

No se necesita activar notificaciones ni enviar mensajes para completar este recorrido. Las cantidades, empaques y precios siguientes son ejemplos sintéticos que solo se confirman en QA.

## Recorrido breve

| Tiempo orientativo | Qué hacer                                                                                                                                                    | Qué debe verse                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–1:00          | En Catálogo, tocar **Agregar producto**. Crear una segunda fruta de QA, variedad y calibre desde ese mismo recorrido; confirmar un empaque de caja completa. | Las nuevas opciones quedan seleccionadas, sin visitar pestañas de administración. El calibre no se interpreta como cantidad de piezas. Al guardar aparece la entrada a recepción con el producto elegido.              |
| 1:00–2:00          | Registrar **2 cajas**, costo **USD 25 por caja**, precio promocional **USD 40** y regular **USD 48**. Revisar y confirmar una sola vez.                      | Caja completa no exige conteo de blísteres o piezas. Se confirma una recepción y el inventario muestra 2 cajas, no una suma de cajas más equivalencias.                                                                |
| 2:00–3:00          | Crear o elegir un cliente de QA sin teléfono. Vender **1 caja al contado**, acuerdo promocional/divisa, USD efectivo. Revisar y confirmar.                   | El importe se completa en USD 40. No aparecen fecha pactada ni recordatorio. Saldo USD 0, un comprobante y 1 caja restante. Descargar otra vez el PDF no vuelve a descontar stock.                                     |
| 3:00–4:00          | Vender la caja restante a **crédito**, acuerdo promocional/divisa, **sin abono**. Elegir fecha pactada a 7 días y recordatorio independiente.                | Con abono cero no se pide moneda ni método. Se registra deuda USD 40 sin un pago de cero; el inventario queda en 0 cajas. El crédito aparece en la vista de cobranza correspondiente.                                  |
| 4:00–5:00          | Desde esa factura, registrar **USD 10** y después **USD 30** en efectivo, seleccionando la factura correcta. Descargar el recibo.                            | El cliente y la factura ya están elegidos; el saldo pasa de USD 40 a USD 30 y después USD 0. El crédito pagado sale de las listas pendientes y no genera un aviso de cobro. Sin teléfono no se abre un chat inventado. |

Durante la revisión, antes de guardar, cambiar crédito con fecha a contado: deben desaparecer y limpiarse ambas fechas. Agregar/quitar una línea o cambiar el precio debe actualizar total e importe de contado sin modificar todavía el inventario. No confirmar si el precio elegido o las cantidades no coinciden con lo acordado.

## Dos ejemplos para entender el precio y la moneda

Las tasas de esta tabla son **hipotéticas**, únicamente para explicar la cuenta. Al probar VES se debe usar la cotización verificada que realmente muestre QA; nunca introducir estos valores como una tasa manual.

| Acuerdo desde la venta                                                                        | Cobro posterior                                                                                                                    | Resultado del ejemplo                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Promocional/divisa: una caja a **USD 40**, contado o crédito.                                 | El cliente solo tiene bolívares. Si la cotización USDT compra válida fuera **Bs. 1.000 por USDT**, cobrar el equivalente a USD 40. | **Bs. 40.000** liquida USD 40. El precio sigue siendo USD 40; no se cambia al regular de USD 48. También se pueden recibir USD 40 o USDT 40, 1:1. |
| Regular/BCV: una caja pactada desde el inicio a **USD 48** con referencia BCV para bolívares. | Si la tasa BCV válida fuera **Bs. 900 por USD**, cobrar el equivalente a USD 48.                                                   | **Bs. 43.200** liquida USD 48. El documento conserva el acuerdo BCV y no usa la cotización USDT.                                                  |

La condición contado/crédito no decide el tipo de precio. Las líneas de una venta deben compartir el acuerdo. Para un abono VES que incluya facturas de ambos acuerdos, separar los cobros por fuente; USD o USDT sí pueden repartirse entre ambos porque convierten 1:1. El reparto entre facturas siempre se revisa explícitamente.

## Vigencia, errores y reintento

- VES muestra fuente y cotización. USDT compra tiene una vigencia corta de 10 minutos desde su verificación; BCV depende de la fecha valor oficial y no se prolonga automáticamente por fin de semana. Si falta o vence la cotización necesaria, actualizarla y revisar el importe antes de confirmar. USD y USDT no requieren conversión a bolívares.
- Si la conexión falla después de confirmar, usar **Reintentar** sobre el mismo contenido. El sistema debe recuperar el mismo documento, incluso si su cotización ya venció; no crear una segunda venta o un segundo abono. Una operación nueva con esa cotización vencida debe rechazarse.
- Un error real debe conservar el borrador y explicar qué corregir. No asumir que se guardó por una animación ni repetir la operación desde un formulario nuevo.
- En el comprobante revisar producto, cantidad, precio pactado, moneda/método, conversión aplicada y saldo. Es un comprobante comercial, no una factura fiscal.

## Qué queda por comprobar físicamente

- **Android del negocio:** apertura de la app, teclado virtual, selección táctil, desplazamiento, botón de confirmación visible y conservación del borrador. Los tamaños emulados de 390, 800/1024 y 1366/1440 px no acreditan esta prueba física.
- **Tablet principal y WhatsApp corporativo:** permiso voluntario para push, recepción real de un aviso pendiente y perfil correcto al abrir un chat. No enviar mensajes ni suscribir otro dispositivo solo para completar esta lista; esa prueba se coordina con el propietario.
- **HP Smart Tank 215:** las futuras notas de entrega en blanco y negro y la impresión física siguen pendientes. Los PDF comerciales actuales no acreditan ahorro de tinta, compatibilidad física ni cumplimiento fiscal.

Anotar versión, dispositivo/navegador, hora y paso que falló. Si algo no coincide, conservar el comprobante y el error para revisión; no corregir saldos o stock a mano.

## Revisión rápida de los demás módulos

Revisión estática del código durante el hotfix, sin certificar aquí comportamiento visual ni pruebas físicas:

| Módulo                | Observación comprobada                                                                                                                                                      | Mejora pequeña o límite                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clientes              | El alta permite teléfono opcional; la ficha abre el abono con cliente/factura seleccionados. La lista carga hasta 200 clientes.                                             | Aclarar que las métricas corresponden a la lista mostrada y conservar el cliente al ir de su ficha a una venta. Ajustes comunicados al responsable de UI; su validación se registra en la entrega. La búsqueda no recorre clientes fuera de esa página.  |
| Cobranza              | Pestañas de hoy/próximas/vencidas/todas pendientes; saldo consultado nuevamente antes de abrir WhatsApp; aviso explícito si hay más de 200 comprobantes.                    | El envío sigue siendo manual. La prueba de dispositivo y perfil corporativo no se sustituye con una revisión de código.                                                                                                                                  |
| Proveedores           | Alta/edición con nombre y contacto opcional, búsqueda y filtro de inactivos; conserva historial.                                                                            | El proveedor debe existir antes de recibir. El enlace desde una recepción vacía conduce a Proveedores; no hay alta contextual en la propia recepción.                                                                                                    |
| Recepciones           | Varias líneas, costo y precios en una pantalla; pide blísteres solo cuando el empaque los admite; revisión antes de confirmar.                                              | La ayuda de catálogo aún usa «configuración de empaque». Simplificar esa etiqueta y un eventual alta contextual son mejoras acotadas, sin cambiar datos o contabilidad. No hay evidencia aquí de recuperación de un borrador tras salir a otra pantalla. |
| Inventario            | Separa cajas cerradas, blísteres, medias cajas y piezas; las equivalencias llevan aclaración de que no suman mercancía. Los vacíos ofrecen recepción o limpieza de filtros. | La trazabilidad detallada permanece en el lote; comprobar legibilidad y desplazamiento en el dispositivo real.                                                                                                                                           |
| Ajustes/configuración | No hay un módulo activo de Ajustes en la navegación operativa actual. La suscripción del dispositivo está dentro de Cobranza.                                               | No se presenta como una pantalla existente ni se añade un módulo nuevo para este hotfix.                                                                                                                                                                 |
