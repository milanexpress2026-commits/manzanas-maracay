# V4.18 — Correcciones de cobros y mercancía por vendedor

Estado: preparada y verificada en staging, candidato `de8bb83651b39c62ff8fcf149ca67249b4659a48`, PR #19. Producción sigue en V4.17 (`d25879918810f9e0a9257aefcf7eb7dcdeac3b94`). No se cambiaron operaciones reales. Publicar requiere autorización operativa sobre el candidato exacto.

## Uso diario

En el detalle de una venta se puede agregar mercancía, quitar productos, corregir abonos o anular. La nota actualiza cantidades y total conservando folio e historial.

- **Quitar productos:** indicar cajas, medias o blísteres retirados y confirmar que quedaron en el local o fueron devueltos. Reintegra las unidades al mismo lote. Si sobra dinero, elegir **Devolver la diferencia** o **Dejar a favor del cliente**. La devolución registra el dinero devuelto; no realiza transferencias bancarias.
- **Corregir abono:** arreglar un importe mal anotado, incluso a cero. Mantiene moneda, método, fecha y tasa originales. Si cubre varias ventas, revisar el reparto entre los mismos comprobantes. Para mercancía retirada usar «Quitar productos», que resuelve inventario y dinero juntos.
- **Saldo a favor:** se muestra separado de la deuda. El selector lo ofrece cuando hay crédito disponible. Puede pagar una compra completa con crédito suficiente o aplicarse a una venta pendiente; el resto se cobra con los métodos habituales. Una nueva venta no mezcla crédito y efectivo en un único envío: se registran abonos separados.
- **Anular venta:** retirar todas sus unidades y resolver lo cobrado en el mismo recorrido. No devuelve inventario dos veces.
- **Resumen:** seleccionar período y Carlos/Randy para ver importes y mercancía por producto/presentación. Cajas, medias y blísteres se muestran por separado. Descuenta devoluciones y anulaciones; las ventas anteriores sin vendedor permanecen sin asignar.

El propietario confirmó «A veces devolvemos y otras queda a favor», respuesta `call_c3d4b48c67934a828e4e5aa842217b17`. Esto amplía las restricciones anteriores. No se identificó ni modificó la venta real de las cerezas.

## Integridad y continuidad

Migración aditiva `0019_corrections_credit`, de19 a20. Añade reducciones, líneas reducidas, asignaciones devueltas y correcciones de pagos; conserva todas las filas y columnas anteriores. No crea crédito ni mercancía. Ventas, cobros y aplicaciones originales siguen inmutables; las vistas vigentes calculan saldos y cantidades.

Cada comando usa transacción, bloqueo comercial, versión esperada, idempotencia y auditoría. El diario local recupera pérdidas de respuesta sin duplicar operaciones. PostgreSQL valida reparto monetario, crédito disponible y retorno único de asignaciones. Devolver mercancía pagada con crédito lo reintegra una sola vez; devolver dinero consume ese crédito liberado. No se alteran abonos de otras facturas ni salidas posteriores del mismo lote.

Los céntimos se calculan desde la cantidad restante, evitando diferencias acumuladas. Bolívares conserva la tasa histórica del abono aun si hoy venció. La nota mantiene su diseño sencillo; el recibo muestra importe vigente, historial y saldo al corregir.

## Verificaciones locales

- Tipos/build final y475 pruebas unitarias en47 archivos aprobados.
- Recorrido completo201/202: una creación concurrente de catálogo agotó el plazo de conexión local. Seguimiento final35/35, incluido ese caso sin cambiar su código, correcciones, resumen y documentos. No afirmar203 aprobados en una sola ejecución.
- Los35 casos finales incluyen devolución/crédito, uso posterior, crédito insuficiente, tasa histórica, varias facturas, devolución parcial/total, redondeo a cero, conflicto entre dispositivos y recuperación tras perder la respuesta.
- Migración limpia20 y actualización19→20 aprobadas; filas, columnas y diecinueve hashes anteriores conservados. Esquema/snapshot sin diferencias. Bases locales previas intactas.
- Producción aislada16/16 aprobada, incluido retiro de mercancía, crédito reutilizado, corrección, resumen neto, PDF y permisos de la aplicación. Entorno sintético local retirado correctamente.
- Operadores de publicación:10 controles aprobados. Exigen nueva aprobación exacta para producción.
- UI390/800/1440px sin desbordamiento ni hallazgos de accesibilidad en los recorridos nuevos. Impeccable: revisión final `ship`, detector sin hallazgos y documenter `No changes`; marca y logo preservados.
- Recibo corregido DEMO renderizado y revisado, legible y sin cortes. Poppler avisó de fuentes de sustitución opcionales ausentes; conserva las fuentes PDF estándar existentes. Tablet e impresión físicas no comprobadas.

Se conservan las incidencias iniciales: sintaxis CASE, proxy compilado anterior, directiva de componente cliente, expectativas antiguas de pruebas, verificador que esperaba19 migraciones y una parada de PostgreSQL que agotó la espera. Sus seguimientos pasaron; PID propio ausente y base anterior intacta.

## Publicación y recuperación

Verificar primero el candidato en staging. La autorización final incluye subir/compilar producción, pausa breve de aplicación/tasas/recordatorios, respaldo cifrado nuevo en esta computadora y mismo VPS, restauración aislada y migración0019. Conservar ventas, inventario, clientes, acceso y tablet; sin DNS/Caddy ni otros proyectos.

No hay rollback automático sobre datos posteriores. Ante fallo, mantener escritores propios pausados, conservar evidencia y evaluar recuperación. No eliminar bases ni restaurar encima de operaciones nuevas. Después comprobar acceso, notas y respaldo posterior.

## Cierre de staging

Candidato exacto compilado y saludable;20 migraciones, filas y columnas anteriores conservadas, respaldo previo y posterior a la migración restaurados y19 comprobaciones autenticadas aprobadas. Recolector propio reanudado. Producción y configuración de otros proyectos intactas. El paquete idéntico de producción está preparado localmente; aún no subido ni autorizado.

Se conservan dos verificaciones fallidas por el estado intermedio del reinicio automático de un peer conocido. Su identidad/configuración permanecieron iguales y la observación posterior confirmó el incremento del contador. Se corrigió únicamente esa transición acotada del verificador, con8 pruebas nuevas y18 anteriores aprobadas. Una verificación nueva y la compilación pasaron; no se modificó el servicio ajeno.

La verificación posterior coincidió con un contenedor temporal del recolector programado de producción y mantuvo staging pausado. Se conservó la incidencia y se recuperó el mismo candidato tras comprobar nuevamente datos, respaldos y pares. No se repitió la migración ni se intervino el recolector de producción;7 controles de recuperación aprobados.
