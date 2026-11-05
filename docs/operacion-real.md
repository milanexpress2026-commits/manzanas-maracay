# Guía de operación real

Esta guía describe el recorrido preparado para producción. **No acredita que la apertura al público del negocio esté habilitada.** El estado de publicación y los controles pendientes se registran en [entrega de fase 4](entrega-fase-4-produccion.md). Si aparece «Operación en preparación», puedes consultar los módulos, pero todavía no registrar mercancía, ventas ni cobros.

## Entrar desde los dispositivos del negocio

Los propietarios usan un único acceso privado en sus teléfonos, tablet y computadora. No es necesario crear una cuenta individual para cada socio. El usuario y la contraseña se entregan por un canal privado; no se publican en el repositorio ni en esta guía. Cada dispositivo mantiene su propia sesión y puede cerrarla desde el botón «Cerrar sesión».

Al entrar, puedes marcar **Mantener sesión activa** para conservar el acceso durante 30 días en ese dispositivo, incluso al cerrar y volver a abrir el navegador. La opción comienza desmarcada. Sin marcarla, la sesión dura como máximo 8 horas y vence tras 30 minutos sin actividad. La opción no guarda tu contraseña; «Cerrar sesión» revoca el acceso de ese dispositivo aunque todavía no hayan transcurrido los 30 días. La renovación de la contraseña revoca las sesiones anteriores.

El historial conserva la fecha y el acceso que registró cada operación. Al compartir el acceso, no distingue automáticamente cuál de los propietarios realizó una acción. No compartas ese acceso con clientes. Si un dispositivo deja de pertenecer al negocio, solicita la revocación de sus sesiones y la renovación del acceso cuando corresponda.

La raíz de producción lleva al inicio privado o al acceso, según la sesión. No ofrece demostraciones ni datos públicos del almacén. Se necesita conexión para consultar información actual y confirmar operaciones; los cambios sin guardar no se envían automáticamente al recuperar la conexión.

## Cargar la primera mercancía

Producción comienza sin proveedores, productos, inventario, precios, clientes, ventas ni deudas de ejemplo. En «Inicio», los pasos de preparación se completan a medida que guardas tus registros. Puedes usar la navegación libremente y plegar la guía.

1. En **Proveedores**, registra quién entrega la mercancía. Conserva su nombre e identificación reales; agrega teléfono y observaciones cuando sean necesarios.
2. En **Catálogo**, agrega la fruta. Registra variedad y calibre únicamente cuando correspondan al producto. No crees una variedad ficticia para completar un campo opcional.
3. Crea el **empaque**: caja con blíster, caja divisible en dos mitades comerciales o solo caja completa. Define las presentaciones que se venden y confirma solamente las reglas conocidas. Una configuración pendiente no se ofrece para recibir ni vender en producción. Consulta [pendientes comerciales](pendientes-comerciales.md) antes de completar cantidades desconocidas.
4. En **Recepciones**, selecciona proveedor, referencia del documento, fecha y hora de Venezuela. Agrega una línea por configuración, con cajas cerradas y costo real de mercancía por caja. El costo no incluye flete, descarga ni transporte.
5. Para cada línea, elige **Conservar precios** o **Actualizar precios**. Al actualizar, completa las listas promocional y normal de las presentaciones que vas a vender. Media y blíster tienen precio propio; no se calculan automáticamente dividiendo el de la caja. Un par de precios vacío no crea un precio de cero.
6. Pulsa **Revisar recepción**, comprueba cantidades y costo total y luego confirma. La recepción crea las existencias y conserva el costo y empaque de cada lote. Agregar un producto al catálogo no agrega mercancía.

La referencia de una recepción no se repite para el mismo proveedor. Si se pierde la confirmación de red, conserva el formulario y reintenta la misma operación; evita reconstruirla como otra recepción. Consulta el inventario antes de registrar un documento nuevo si no conoces el resultado.

## Inventario y cambios de empaque

Inventario muestra cajas cerradas, cajas abiertas con contenido, blíster, medias y piezas contadas cuando existen. Una caja abierta no suma otra caja vendible además de su contenido. Desconocido no significa cero y el calibre nunca determina cuántas frutas hay.

Abre el lote para consultar su historia. Las acciones disponibles dependen del empaque: dividir una caja comercial produce dos medias sin contar fruta; preparar una media por conteo exige que preparado más remanente coincidan con el conteo físico. No hay venta por pieza suelta. Los ajustes y reversas requieren motivo y conservan el historial; no sirven para borrar una recepción o inventar costo.

## Registrar una venta

Registra primero el cliente; su teléfono internacional es opcional para vender y necesario para abrir WhatsApp. En **Nueva venta**, selecciona cliente y agrega los productos con su presentación, cantidad entera y referencia comercial. Puedes pactar el precio de cada línea sin cambiar la lista general.

Elige **Contado** cuando recibes el pago completo o **Crédito** cuando queda saldo. Un crédito admite pago inicial cero, sin crear un recibo de cero. Puedes indicar fecha de pago pactada a 7 o 15 días, una fecha personalizada o dejarla pendiente. El recordatorio interno de cobranza es una fecha distinta.

Revisa antes de confirmar. La venta, salida de mercancía y deuda se registran juntas. El sistema asigna el costo por antigüedad de los lotes disponibles; no se elige manualmente un lote para cambiar el margen. La ganancia mostrada es bruta de mercancía, sin gastos accesorios.

El PDF descargable es un **comprobante comercial de venta**, no una factura fiscal. El recibo para el cliente no incluye costos internos de compra. Editar una lista de precios después no modifica comprobantes ni costos históricos.

## Registrar abonos y cobrar

Desde el comprobante o el estado del cliente, pulsa **Registrar abono**. Selecciona moneda, importe, fecha y método. Elige el comprobante exacto; si repartes el pago entre varios, indica cuánto corresponde a cada uno. La suma debe coincidir con el pago y no puede superar los saldos. Revisa y confirma para generar el recibo de abono.

La deuda se lleva en USD y se calcula desde las ventas y los pagos vigentes. **VES permanece bloqueado mientras no exista una tasa BCV oficial, verificada y vigente.** No ingreses una tasa supuesta ni otra fuente para sortear el bloqueo. USD no necesita conversión BCV.

**Cobranza** separa recordatorios de hoy, próximos y vencidos. «Cobrar por WhatsApp» consulta el saldo actual y abre un mensaje prellenado al teléfono guardado; revisa el destinatario y pulsa Enviar dentro de WhatsApp. La aplicación no envía mensajes ni recibos automáticamente. Sigue pendiente comprobar el perfil corporativo en la tablet Android del negocio.

Los avisos push requieren activación voluntaria en una sola tablet. El permiso del navegador se solicita al pulsar la activación. Reemplazar la tablet o actualizar una configuración anterior requiere confirmación. El aviso en pantalla bloqueada no muestra cliente ni deuda; abre el centro privado para consultar el detalle. La aceptación por el proveedor de notificaciones no prueba recepción física: falta verificar permiso, entrega, revocación y apertura en la tablet real.

## Corregir sin borrar el historial

Reversar un abono o anular una venta genera una corrección auditada. Una venta con abonos activos o dependencias posteriores puede requerir resolver esas dependencias antes de anular; la aplicación explica el conflicto. No registres una operación distinta para forzar un saldo. Las devoluciones parciales y sus condiciones comerciales siguen pendientes de acuerdo; no se ofrece un flujo improvisado para ellas.
