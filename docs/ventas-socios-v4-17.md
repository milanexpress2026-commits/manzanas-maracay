# V4.17 — Vendedores, agregar productos y anular pedidos

Estado: publicada y verificada en producción y staging, versión `d25879918810f9e0a9257aefcf7eb7dcdeac3b94`, PR #18. Autorización específica del propietario recibida y aplicada; migración 0018 completada sin alterar los datos anteriores.

## Uso para Carlos y Randy

- Al hacer una venta, elegir **Vendedor: Carlos o Randy**. No hay una selección automática que pueda atribuir una venta al socio equivocado.
- Si el cliente agrega mercancía antes de irse, abrir la venta y pulsar **Agregar productos a esta venta**. Cargar únicamente los productos extra y su precio; revisar y confirmar. Se conserva el mismo número y se puede volver a imprimir la nota completa.
- En contado se cobra el importe extra. Las líneas y los cobros anteriores permanecen guardados. Una venta a crédito que ya tiene abonos no se modifica: el nuevo pedido se registra aparte, como aclaró el propietario.
- Para un pedido cancelado sin cobros activos, pulsar **Anular venta** y confirmar que la mercancía está en el local o fue devuelta. La venta queda anulada, conserva su historial y recupera sus existencias. No se borra ni se simula devolución de dinero.
- Desde Ventas, abrir **Resumen por vendedor**, elegir fechas o **Este mes**. Se muestran cantidad de ventas, vendido, cobrado y pendiente. Las ventas anuladas quedan fuera; las antiguas aparecen como **Sin vendedor asignado**.

El resumen usa la fecha original de venta en Venezuela. Los productos agregados forman parte de esa misma venta; cobrado y pendiente muestran su situación actual, no los cobros efectuados exclusivamente dentro del período elegido. El vendedor comercial es una elección del operador y no una autenticación individual: se conserva el acceso compartido de los dueños.

## Alcance de la edición

La aclaración del propietario describe una ampliación del pedido, no devoluciones ni modificación de créditos abonados. Por ello esta entrega agrega líneas y conserva cliente, vendedor, condición, acuerdo, fecha, precios y cobros originales. No quita líneas anteriores ni reduce el total. La nota conserva el total actualizado, nombre/RIF/dirección y la referencia BCV del día original de la venta; los cobros adicionales tienen sus propios snapshots de moneda y tasa.

Un corte de conexión después de guardar permite recuperar la misma solicitud. La recuperación no depende de que el stock siga disponible ni cobra dos veces. Si alguien ya amplió la venta desde otro dispositivo, una solicitud nueva exige revisar la versión actual para no pasar por alto ese cambio.

## Persistencia e inventario

Migración aditiva `0018_sellers_sale_additions` (18→19). Ninguna migración anterior cambia. Añade vendedor nullable, historial de ampliaciones, vínculo de líneas ampliadas, retornos exactos y vista de total vigente. No asigna vendedores a la historia, no siembra productos ni crea operaciones comerciales. Las filas y campos anteriores deben conservar sus hashes durante la migración; los dos campos nuevos empiezan NULL y las dos tablas nuevas vacías.

Las ampliaciones y los pagos se confirman junto con FIFO, auditoría e idempotencia dentro de una transacción. Restricciones de PostgreSQL impiden líneas sin total coherente, cobros excesivos y retornos duplicados. La deuda usa el total original más ampliaciones, manteniendo inmutables los importes históricos.

Anular una venta reciente puede revertir su salida original. Si el lote ya tuvo otras operaciones, devuelve solo las asignaciones de la venta anulada a recipientes independientes del mismo lote, unidad y costo. No deshace ventas posteriores. Caja, media caja y blíster conservan su significado; las medias comerciales no inventan frutas contadas ni cajas cerradas.

## Verificaciones y publicación

La evidencia final se registra en `verificacion-v4-17.json`. QA usa datos sintéticos en bases exclusivas, nunca ventas reales de producción. Debe cubrir nueva venta por vendedor, ampliación de contado, crédito sin abonos, rechazo de crédito abonado, concurrencia, cancelación tras movimientos posteriores, medias de cinco blísteres, recuperación tras respuesta perdida, resumen y documentos.

La publicación conservó los datos reales, acceso y tablet. Se verificaron respaldos cifrados en la computadora y el mismo VPS con recuperación aislada, antes y después del cambio; aplicación/tasas/recordatorios se pausaron durante la migración0018 y volvieron a quedar activos. No hubo cambios de DNS, Caddy ni otros proyectos. Tras publicar, cerrar y volver a abrir la aplicación instalada permite cargar la interfaz nueva. La validación de escritorio/celular/tablet simulada no sustituye la comprobación del dispositivo físico por sus dueños.

## Incidencias de desarrollo conservadas

- Se corrigió un paréntesis de una condición PL/pgSQL antes de aplicar la migración de QA.
- Un primer ensayo usó el proxy web compilado anterior y devolvió 404 para rutas nuevas; se reconstruyó la web antes de continuar.
- Las pruebas detectaron que el retorno de media comercial necesitaba admitir piezas desconocidas y contabilizar media caja en su equivalencia. Se corrigieron ambos puntos y se comprobó su reventa.
- Se actualizó el doble de consulta de una prueba unitaria para la vista de total vigente.
- La revisión visual pidió evitar sumar dos veces el extra en el diálogo de recuperación, mostrar todas las cifras del resumen móvil y compactar los filtros. Se aplicaron los ajustes y se añadió un corte de respuesta después del commit con recarga real en el navegador.

## Cierre de preparación

Tipos/build y 464 unitarias aprobados. Batería completa186/187, seguida de5/5: el caso pendiente requería seleccionar vendedor tras una recarga; se corrigió la prueba sin cambiar el runtime. Producción aislada15/15; migración limpia e historia18→19 conservada; operador11/11. Staging saludable,19 migraciones, filas anteriores conservadas, respaldo anterior/posterior restaurados y18 controles autenticados aprobados. Respaldo cifrado actual de producción en computadora y VPS recuperado en aislamiento.

El PR permanece abierto sin merge. Después de la autorización se subió y compiló el mismo candidato, se pausaron solo los escritores y tareas propias, se renovó el respaldo y se aplicó0018 en producción, conservando todos los campos y filas anteriores. El acceso, los documentos y las tareas quedaron verificados después de reanudar. No hay rollback automático: si la migración o las comprobaciones fallan, conservar la evidencia y mantener los escritores propios pausados para evaluar la recuperación; no restaurar sobre operaciones posteriores ni eliminar datos.

Una consulta de progreso de solo lectura coincidió con la escritura del archivo de estado y se repitió correctamente. No fue un fallo de migración; la evidencia privada se conserva.

## Publicación completada

Producción saludable con 19 migraciones, historia conservada y recolector reanudado. Pasaron 21 controles HTTPS de acceso/tasas, las pantallas nuevas en una simulación Android instalada de 800 px, la lectura de notas reales Carta/A4 y su comprobación visual. Se conservaron identidad formal, dirección, BCV del día de la venta, firmas y el registro original. La compresión continúa activa. No se registraron ventas sintéticas ni modificaciones de negocio durante estas comprobaciones.

Después de la migración, un contenedor temporal terminó entre el listado de Docker y su inspección. El operador de despliegue mantuvo sus escritores pausados. Se conservó el fallo original, se repitieron los comparadores originales de servicios y datos y se reanudaron los mismos contenedores aprobados; no se repitió la migración ni se restauró sobre datos reales. La lectura de inventario de contenedores ahora reintenta únicamente ese error específico, sin omitir servicios ni relajar comparaciones.

La comprobación previa a reanudar se ajustó para esperar 502 solo en la API propia pausada, manteniendo iguales los controles de los demás servicios y del proxy. Luego un corte SSH interrumpió una verificación de lectura con la aplicación ya activa. Se retomó mediante una conexión nueva con identidad del servidor verificada, sin otro reinicio. El acceso normal 200, la integridad y los controles originales pasaron antes del cierre.

El respaldo posterior cifrado PC/VPS se restauró correctamente a `2026-11-16T20:36:29.643027+00:00`. Cerrar completamente y volver a abrir la aplicación en cada teléfono/tablet carga la interfaz publicada; no requiere reinstalar. La comprobación física del dispositivo y de la impresora corresponde a los dueños. No repetir esta publicación, la migración ni vaciados.
