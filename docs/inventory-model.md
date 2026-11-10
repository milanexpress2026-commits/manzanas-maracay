# Inventario y costo de mercancía — Fase 3

La fuente comercial primaria es [domain-rules.md](domain-rules.md). Este documento explica cómo se representa y protege el inventario; los resultados ejecutados se distinguen de las pruebas pendientes en [entrega-fase-3.md](entrega-fase-3.md).

## Configuración y snapshots

Actualización V4.12: el usuario confirmó media caja como la mitad exacta, también en fruta con blísteres. Las nuevas ventas dividen automáticamente cajas disponibles y aprovechan remanentes del mismo lote. Las referencias posteriores a preparación contada describen operaciones históricas/avanzadas, no un requisito para vender media. Véase [medias comerciales](medias-comerciales-v4-12.md).

La identidad comercial es fruta, variedad opcional, calibre opcional y línea comercial. El calibre es una etiqueta de tamaño, nunca un conteo de piezas. Una configuración puede tener datos pendientes: se conserva `null` cuando la cantidad de blíster es desconocida y se bloquean las operaciones que requieren conocerla.

| Capacidad              | Valores y efecto                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packingModel`         | `blister`: caja con blíster; `halves`: caja divisible en dos medias comerciales; `whole`: solo caja completa.                                  |
| `halfPreparation`      | `counted`: exige conteo físico; `commercial`: dos medias sin contar frutas; `pending`: no permite preparar mitades todavía; `none`: no aplica. |
| `allowedPresentations` | Presentaciones autorizadas entre `box`, `half_box` y `blister`. Nunca se vende por pieza suelta.                                               |
| `blistersPerBox`       | Entero configurado o desconocido; la recepción puede sobrescribirlo para ese lote.                                                             |
| `boxWeightKg`          | Peso definido opcional; no crea una modalidad de venta por peso. Kiwi puede conservar 10 kg por caja y 5 kg por media.                         |
| `confirmationStatus`   | Distingue configuración confirmada de datos comerciales pendientes.                                                                            |

No hay condiciones por nombre de fruta en el motor. Manzana granel y kiwi usan medias comerciales; uva usa caja completa; pera admite configuraciones pendientes sin inventar un empaque. Las particularidades de Lady/Pink Lady, pera y mandarina no se fijan como reglas reales sin confirmación.

Cada lote conserva proveedor, fecha de recepción, costo por caja, versión de configuración, blíster por caja, modalidad, preparación de media, presentaciones y peso. Cambiar el catálogo, precios o costos de otra compra no reescribe estos snapshots.

## Identidad física y cantidades

Cada caja recibida y cada recipiente generado al fraccionar tienen una identidad propia. Una caja, blíster o media disponible tiene cantidad entera 0 o 1. El recipiente abierto no añade otra existencia a su contenido: solo se suman los saldos terminales disponibles.

| Recipiente         | Estado y saldo                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Caja cerrada       | `box / sealed / sealed_box`, cantidad 1, piezas desconocidas.                                      |
| Caja abierta       | `box / open`, saldo de caja cerrada 0; contenido disponible en hijos.                              |
| Blíster intacto    | `blister / sealed / intact_blister`, cantidad 1, piezas desconocidas.                              |
| Blíster abierto    | `blister / open / loose_piece`, piezas contadas físicamente.                                       |
| Media contada      | `half_box / sealed / prepared_half_box`, cantidad 1, piezas contadas.                              |
| Media comercial    | `half_box / sealed / prepared_half_box`, cantidad 1, piezas `null`.                                |
| Remanente contado  | `loose_bin / open / loose_piece`, conserva las piezas restantes; no es una presentación comercial. |
| Vacío o despachado | Cantidad 0; conserva identidad e historial, fuera del disponible.                                  |

El resumen separa cajas cerradas, abiertas con contenido, blíster intactos/abiertos, medias y piezas conocidas. `null` no equivale a cero. Las equivalencias solo se calculan donde existe una relación comercial definida; una media contada no equivale universalmente a la mitad de una caja.

- Tres cajas de cinco blíster menos uno dejan dos cajas cerradas y cuatro blíster en una caja abierta: catorce blíster equivalentes. Agotar esos cuatro deja la caja vacía.
- Diez cajas granel menos una caja y una media dejan ocho cajas cerradas y una media comercial: 8,5 cajas equivalentes, sin inventar blíster ni piezas.
- Una caja kiwi de 10 kg dividida conserva dos medias de 5 kg por configuración, sin volver a pesar ni contar cada venta.
- Preparar media contada exige contado = preparado + remanente; 37 = 18 + 19 es válido. Esa preparación no habilita venta de piezas.

## Recepciones y listas de precios

Una recepción admite hasta 50 líneas y 1.000 cajas en total. Cada línea crea un lote con cajas cerradas; referencia única por proveedor. El servidor fuerza `isDemo` en staging, preview y pruebas. No se genera inventario de muestra al migrar una base limpia.

Documento, lotes, stock, costo y cambios explícitos de precios se confirman juntos. Cada línea elige conservar precios o actualizar las presentaciones indicadas. No es obligatorio inventar precios para presentaciones pendientes. Las listas promocional USD efectivo y normal de referencia para VES son independientes del costo y entre sí; media y blíster no se derivan automáticamente del precio de caja.

Los proveedores se editan con versión y se desactivan, sin eliminar los referenciados. La configuración se bloquea al recibir para copiar una versión consistente. Dividir recepciones mayores respeta el límite operativo.

## Operaciones y costo

| Operación               | Efecto físico y contable                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Abrir caja con blíster  | Sustituye una caja cerrada por los blíster de su snapshot. Distribuye el costo existente, sin crear valor.                                                                           |
| Retirar/vender blíster  | Consume primero los disponibles dentro de cada lote; abre cajas solo si hacen falta. El retiro interno conserva su diferencia frente a una venta documentada.                        |
| Abrir blíster           | Exige conteo físico; conserva el costo en las piezas contadas.                                                                                                                       |
| Preparar media contada  | Conserva las piezas preparadas y restantes y distribuye el costo según el conteo.                                                                                                    |
| Dividir media comercial | Crea dos medias con piezas desconocidas; cada una recibe su porción de costo.                                                                                                        |
| Vender caja             | Requiere una caja cerrada; no fabrica una caja a partir de equivalencias de remanentes.                                                                                              |
| Ajustar                 | Exige motivo, rechaza negativos e incoherencias; una reducción de piezas reduce su costo proporcionalmente. Recuperar existencia desde cero exige una reversa admisible o recepción. |
| Revertir                | Compensa el último movimiento admisible del lote, una sola vez; restaura cantidades, estados y costo sin borrar el original.                                                         |

Importes de costo se almacenan como `NUMERIC` y se calculan con `Decimal` a cuatro decimales. Al distribuir costo, las porciones anteriores se redondean hacia abajo y la última conserva el residuo: 25/3 produce 8,3333 + 8,3333 + 8,3334. El valor cero no se usa para ocultar un costo desconocido.

`stock_balances.cost_usd` es la proyección actual del mismo inventario. `inventory_cost_entries` registra antes/después por recipiente y movimiento; `inventory_cost_openings` conserva la base trazable de costo de existencias anteriores a Fase 3. No existe un segundo stock comercial. Restricciones diferidas concilian proyección, cadena de costo y conservación al confirmar la transacción. Un recipiente sin cantidad no debe conservar valor disponible; la migración aditiva `0009_empty_stock_cost_guard.sql` refuerza esa regla.

La actualización desde Fase 2 reconstruye costos desde sus snapshots sin editar movimientos anteriores. Si no puede reconstruirse un costo, queda desconocido y bloquea la venta correspondiente. La prueba de actualización conservó las 16 tablas históricas examinadas y los seis hashes previos; el caso de tres cajas de costo 30 menos un blíster conservó 84 de 90 USD. El [informe de migraciones](verificacion-migraciones-fase3.json) identifica exactamente la ejecución y el conjunto de migraciones validado.

## FIFO y venta atómica

El servidor asigna lotes compatibles por fecha de recepción, creación e ID; el operador no selecciona manualmente lotes. Se conserva asignación por línea, lote, recipiente, movimiento y costo en `sale_allocations`. Cada asignación identifica un recipiente físico despachado. La selección es FIFO contable; no afirma conocer qué caja tomó físicamente el operador.

Ejemplo obligatorio: 10 cajas a 25 USD y 10 a 27 USD; venta de 12 a 40 USD. Ingreso 480, costo 304, ganancia bruta estimada 176; quedan ocho cajas del segundo lote. No se incluyen flete, descarga ni otros gastos en ese bruto.

La venta y `consumeSale` comparten el mismo `PoolClient` y commit: comprobante, líneas, asignaciones, salidas, costos, abono inicial opcional, auditoría y respuesta idempotente. Fallar en cualquier línea revierte todo. Los chequeos PostgreSQL verifican correspondencia de presentación, recipiente, movimiento y costo, y evitan vender existencias recibidas después de la fecha de venta. Una solicitud simultánea no puede consumir dos veces la última caja.

Cada mutación exige sesión y `Idempotency-Key` UUID. Huella = operación, datos normalizados y actor autenticado. El reintento idéntico devuelve la misma respuesta; otra huella con la misma clave produce conflicto. Orden común: clave → bloqueo del árbol → lotes/saldos y documentos en orden estable. El bloqueo global es conservador y puede limitar escala. No se hace red externa dentro de la transacción.

Los movimientos, entradas y documentos confirmados son inmutables. Cada entrada nace en la transacción de su movimiento. Restricciones diferidas comprueban árbol físico, ausencia de doble conteo, snapshots, versiones y ledger antes del commit. Los estados nuevos vacíos conservan identidad al revertir.

## Correcciones comerciales

La anulación completa exige ausencia de abonos activos y posibilidad de revertir los movimientos de todos los lotes afectados sin dependencias posteriores. Crea evento de anulación y movimientos compensatorios, restituyendo el mismo costo. Reversar un abono crea un evento; no significa ejecutar una devolución bancaria. Fechas reprogramadas dejan historial separado, sin sobrescribir silenciosamente el vencimiento original. Devoluciones parciales siguen pendientes de definición comercial.

## Contratos y evidencia

Contratos físicos: `packages/domain/src/inventory.ts`; comerciales: `packages/domain/src/commerce.ts`. API de inventario: proveedores, recepciones, consultas por lote, apertura, retiro, preparación, ajustes y reversas. Ventas, abonos y precios usan el mismo motor transaccional.

Pruebas ejecutables relacionadas:

- `tests/unit/inventory.test.ts` y `tests/unit/commerce.test.ts`: conteos, contratos, precisión decimal, fechas y pagos.
- `tests/e2e/inventory.spec.ts`: motor de Fase 2, concurrencia, reintentos, rollback y reversas.
- `tests/e2e/packaging-phase3.spec.ts`: cuatro modalidades en una recepción, configuración pendiente y residuos de costo.
- `tests/e2e/commerce.spec.ts`: FIFO, atomicidad venta/stock, negociación, pagos, concurrencia, correcciones y defensas SQL.
- `scripts/verify-phase3-migrations.ts`: base limpia y actualización desde el código exacto de Fase 2 en bases temporales propias, sin modificar la base principal de pruebas.

La presencia de estos archivos no acredita su ejecución. [entrega-fase-3.md](entrega-fase-3.md) registra resultados actuales y pendientes.
