# Venta general de medias cajas — V4.12

Una venta de media caja rechazaba existencias disponibles porque el motor solo buscaba mitades previamente preparadas y contadas. La corrección trabaja por presentación comercial y alcanza todas las configuraciones compatibles, incluidas las ya cargadas.

## Operación de los socios

- Elegir producto, Caja / Media caja / Blíster según su empaque, cantidad y precio.
- Finalizar la venta. El sistema descuenta automáticamente y conserva el sobrante.
- Granel y kiwi: cada media descuenta 0,5 caja; no se solicita contar frutas.
- Caja de cinco blísteres: cada media descuenta 2½. Media más dos blísteres deja 0,1 caja; ese remanente se conserva y puede combinarse con contenido del mismo lote en otra venta.

No hay que volver a cargar el catálogo ni las recepciones. Los productos configurados como solo caja conservan esa presentación. Los precios continúan siendo manuales y las tasas/acuerdos se mantienen.

## Integridad

`0016_commercial_half_boxes.sql` añade la unidad interna `box_fraction` a los saldos existentes. Representa subdivisiones comerciales enteras: una caja con B blísteres equivale a 2B subdivisiones, una media a B y un blíster a dos. No representa frutas ni crea otro inventario.

Cada salida conserva la identidad y procedencia de sus contenidos, costo conocido o NULL, y remanente exacto. Las restricciones comprueban que lo descontado coincide con las presentaciones vendidas. Los conteos históricos mantienen su significado. No se modifican filas existentes ni migraciones anteriores.

La disponibilidad y la confirmación comparten el planificador; la transacción impide sobreventa concurrente y conserva reintentos, anulación y precios históricos. Las cajas completas no se reconstruyen automáticamente de remanentes. No se juntan fragmentos de lotes distintos para formar una sola presentación.

## Verificación y publicación

450 pruebas unitarias, tipos y compilaciones aprobados. Los nuevos recorridos dirigidos cubren cuatro/cinco blísteres, mezcla de media y blíster, remanente, costos históricos, anulación, reintentos, concurrencia, catálogo anterior, granel y venta desde celular/tablet. La verificación completa y la preparación de staging continúan; este documento no afirma publicación en producción.

La publicación requiere respaldo cifrado restaurado, ensayo de actualización 16→17 sin cambiar filas, verificación de staging y aprobación operativa del propietario sobre el commit concreto. Preservar mercancía real, acceso, tablet, notas y tasas. No vaciar datos ni cambiar DNS/Caddy. Si hay un fallo después de aplicar la migración, mantener solo los escritores propios detenidos y revisar la recuperación; no iniciar automáticamente un runtime anterior sobre nuevas fracciones.
