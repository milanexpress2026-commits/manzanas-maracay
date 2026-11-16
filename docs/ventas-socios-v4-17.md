# V4.17 — Vendedores, agregar productos y anular pedidos

Estado: implementación y verificación en curso. Producción continúa en V4.16; esta actualización necesita autorización operativa sobre la versión concreta antes de activarse.

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

La publicación conservará los datos reales, acceso y tablet. Requiere respaldo cifrado en la computadora y el mismo VPS con recuperación aislada, pausa breve de aplicación/tasas/recordatorios, migración0018 y verificación posterior. No necesita cambios de DNS, Caddy ni otros proyectos. Tras publicar, cerrar y volver a abrir la aplicación instalada permite cargar la interfaz nueva. La validación de escritorio/celular/tablet simulada no sustituye la comprobación del dispositivo físico por sus dueños.

## Incidencias de desarrollo conservadas

- Se corrigió un paréntesis de una condición PL/pgSQL antes de aplicar la migración de QA.
- Un primer ensayo usó el proxy web compilado anterior y devolvió 404 para rutas nuevas; se reconstruyó la web antes de continuar.
- Las pruebas detectaron que el retorno de media comercial necesitaba admitir piezas desconocidas y contabilizar media caja en su equivalencia. Se corrigieron ambos puntos y se comprobó su reventa.
- Se actualizó el doble de consulta de una prueba unitaria para la vista de total vigente.
- La revisión visual pidió evitar sumar dos veces el extra en el diálogo de recuperación, mostrar todas las cifras del resumen móvil y compactar los filtros. Se aplicaron los ajustes y se añadió un corte de respuesta después del commit con recarga real en el navegador.
