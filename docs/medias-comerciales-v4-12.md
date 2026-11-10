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

Runtime publicado: `22b8f6d7a24358c379a133b0435e79de7ec80d16`, [PR #13](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/13). El propietario autorizó expresamente esta versión y 0016; producción quedó saludable, con todas las filas conservadas. No repetir la publicación.

450 pruebas unitarias, tipos y compilaciones aprobados. El recorrido completo pasó 161 de 163 casos, incluidos los nueve nuevos de V4.12; las dos expectativas anteriores que prohibían medias se corrigieron y pasaron en una ejecución dirigida de dos casos. No se presenta como una única ejecución de 163 aprobados. Se cubren cuatro/cinco blísteres, mezcla de media y blíster, remanente, costos históricos, anulación, reintentos, concurrencia, catálogo anterior, granel y venta desde celular/tablet.

Los 14 casos de producción aislada aprobaron con las reglas SQL finales, incluida una configuración antigua que solo autorizaba caja/blíster. Ese ensayo detectó primero otra restricción SQL antigua; se corrigió antes de preparar las imágenes. La evidencia conserva ambos intentos fallidos y la ejecución final aprobada.

La batería de migraciones aprobó las 17 migraciones y las actualizaciones históricas. Además, el respaldo real con 16 migraciones se restauró en PostgreSQL temporal sin red y se actualizó a 17: las filas de las 37 tablas públicas se conservaron exactamente, junto con acuerdos, tasas y permisos. Se verificaron lecturas del rol de aplicación y la limpieza del entorno temporal, sin escribir en la base real.

El paquete de despliegue contiene los archivos del commit y omite únicamente `docs/capturas/` (capturas y videos históricos de documentación). No omite código, migraciones ni recursos visuales de la aplicación. Se conserva el archivo completo original y se comprueban los hashes de cada archivo incluido.

La publicación contó con respaldo cifrado restaurado, ensayo de actualización 16→17 sin cambiar filas, verificación de staging y aprobación operativa del propietario sobre el commit concreto. Preservar mercancía real, acceso, tablet, notas y tasas. No vaciar datos ni cambiar DNS/Caddy. Si hay un fallo después de aplicar la migración, mantener solo los escritores propios detenidos y revisar la recuperación; no iniciar automáticamente un runtime anterior sobre nuevas fracciones.

Staging quedó saludable con el mismo candidato y aprobó los 29 controles comerciales: cajas y medias sin preparación previa, blísteres, remanentes, bloqueo del exceso, reintentos, cobros y notas. Los respaldos anterior y posterior a 0016 se restauraron. Una inspección Docker se interrumpió al desaparecer un contenedor entre la enumeración y la lectura; se conservaron el fallo y las comprobaciones, y se reanudaron los mismos servicios tras verificar los datos, sin repetir migraciones. El recolector quedó reanudado. Las mismas imágenes fueron publicadas después de la aprobación operativa, conservando datos, acceso y tablet, sin cambiar DNS/Caddy.

## Comprobación real posterior

Producción saludable con 17 migraciones. Los 21 controles de acceso, sesión, catálogos, inventario, cobros y tasas aprobaron; los cuatro métodos estaban disponibles al comprobar. Las 14 configuraciones reales con stock ofrecieron medias en la vista previa; la selección funcionó a 390 y 800 px sin desbordamiento horizontal. El inventario quedó idéntico durante estas lecturas, sin registrar ventas de prueba. Se creó un respaldo cifrado posterior en la computadora y el VPS y se verificó su restauración aislada.

El primer verificador de acceso era de una versión sin migraciones y rechazó la evidencia antes de consultar HTTP. Se conservó ese resultado y se adaptó el verificador para exigir el commit aprobado, las 17 migraciones y la prueba de conservación de filas; los 21 controles posteriores aprobaron. No fue un fallo de acceso de la aplicación.
