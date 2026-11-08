# Operación diaria V4.9

En preparación; producción sigue en V4.8 hasta registrar el despliegue.

El propietario pidió corregir los bloqueos de fecha al preparar una venta, simplificar el alta de calibres y vaciar solamente mercancía, ventas, abonos y saldos. Productos, clientes, proveedores, acceso y configuración se conservan.

La hora automática de venta, abono y preflight se resuelve en el servidor; el cuerpo original sigue siendo la identidad del reintento. Las fechas manuales siguen explícitas. La interfaz puede volver a fecha automática. Las tasas se refrescan al volver al dispositivo y cada minuto visible; su reloj usa el instante verificado del servidor y tiempo transcurrido, sin depender del reloj civil del teléfono. Se conservan cotización revisada, acuerdos, inventario y transacciones.

Producto, variedad, calibre y empaque están en un formulario con revisión final. «Agregar calibre a este producto» precarga la identidad y el empaque, y exige confirmar el nuevo; no modifica lotes anteriores ni crea existencias.

El reinicio operativo tendrá respaldo cifrado externo restaurado, alcance explícito de tablas operativas y conservación de maestros. La auditoría y los recibos previos se conservan; los borradores se separan por período y las sesiones anteriores se revocan. Las operaciones del período vaciado no se recuperan como si continuaran vigentes.

Validación local inicial: tipos aprobados y 421 pruebas unitarias. Pruebas integradas, revisión visual, staging, producción y reinicio todavía pendientes. No se añadieron ni modificaron migraciones.
