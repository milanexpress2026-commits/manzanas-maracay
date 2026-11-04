# Inventario operativo de Fase 2

## Identidad física y cantidades

Cada caja recibida y cada blíster generado al abrirla tienen un contenedor propio. Un saldo de caja, blíster o media caja es 0 o 1; la fruta suelta usa piezas enteras. Un contenedor es una identidad física, no otra unidad que se suma al contenido.

- Caja cerrada: `box / sealed / sealed_box`, cantidad 1 y piezas desconocidas (`null`).
- Caja abierta: `box / open`, saldo de caja 0 y contenido disponible en hijos.
- Blíster intacto: `blister / sealed / intact_blister`, cantidad 1, sin inferir piezas.
- Blíster abierto: `blister / open / loose_piece`, con piezas contadas.
- Media caja preparada: `half_box / sealed / prepared_half_box`, cantidad 1 y piezas contadas.
- Fruta suelta de una caja fraccionada: `loose_bin / open / loose_piece`, hijo de la caja abierta.
- Vacío o retirado: cantidad 0 y estado `empty` o `dispatched`; no aumenta el saldo disponible.

El resumen separa cajas cerradas, cajas abiertas con contenido, blíster intactos, blíster abiertos, medias cajas, piezas de medias cajas y piezas sueltas. `equivalentIntactBlisters` solo convierte cajas cerradas y blíster intactos; excluye empaques fraccionados y fruta contada. No se ofrece una equivalencia ficticia para estos últimos.

## Recepciones y proveedores

Los proveedores se crean, editan con versión y desactivan; no se borran los referenciados. Una recepción tiene proveedor, referencia, fecha, observaciones y hasta 50 líneas. En esta fase la recepción física es por cajas cerradas. Cada línea crea un lote y conserva cantidad recibida, costo USD, regla/version, blíster por caja y notas.

El valor habitual viene del catálogo, pero la línea puede sobrescribirlo entre 1 y 100 blíster. Se bloquea la regla durante la recepción para tomar una copia consistente. Una recepción admite hasta 1.000 cajas; las mayores se dividen. Todos los renglones se confirman o se revierten juntos si alguno falla. La referencia es única por proveedor.

La migración crea únicamente `Almacén principal`; no genera proveedores ni existencias. `isDemo` identifica muestras explícitas y el servidor lo fuerza en `staging`, `preview` o `test`, aunque el cliente envíe otro valor. Los datos de staging y pruebas deben vivir en bases independientes.

## Operaciones

| Operación           | Efecto real                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abrir caja          | Retira una caja cerrada de la proyección y crea exactamente los blíster de la configuración histórica del lote.                                                                               |
| Retirar blíster     | Consume primero blíster ya disponibles; abre cajas solo si hacen falta y retira todo en la misma transacción. Es un retiro interno, no una factura.                                           |
| Abrir blíster       | Exige conteo físico y cambia un blíster intacto por sus piezas contadas.                                                                                                                      |
| Preparar media caja | Exige contado = preparado + restante. Acepta caja cerrada, blíster intacto o fruta suelta contada. Crea una media caja física y conserva los remanentes.                                      |
| Ajustar             | Exige motivo. Rechaza saldo negativo, empaques fraccionarios y conteos incoherentes; registra una nueva entrada.                                                                              |
| Revertir            | Solo el último movimiento del lote, una sola vez, sin movimientos posteriores. Restaura cantidades y estados mediante un movimiento compensatorio; conserva contenedores creados como vacíos. |

Ejemplo: 3 cajas de 5 blíster → retiro de 1 → 2 cajas cerradas y 4 blíster intactos en una caja abierta (14 equivalentes). Retirar esos 4 deja 2 cajas cerradas y una caja vacía, que no se cuenta como abierta disponible.

Una media caja preparada desde 37 piezas puede contener 18 y dejar 19. No se asume media unidad de blíster. En ajustes de fruta suelta, cantidad y piezas cambian juntas. Para retirar una media caja entera se indica cantidad −1 y las piezas contadas negativas correspondientes.

## Transacciones, auditoría e historial

Cada escritura exige sesión y `Idempotency-Key` UUID. La huella incluye operación, datos normalizados y actor autenticado. Un reintento idéntico devuelve la misma respuesta; una clave reutilizada con otro contenido o actor produce conflicto.

Orden de bloqueo: clave idempotente → árbol de inventario → lote → saldos en orden de ID. El bloqueo del árbol es conservador para esta fase y limita concurrencia entre lotes; no se hacen llamadas externas durante la transacción. Una contención transitoria devuelve un error recuperable para repetir la misma solicitud. El rol de aplicación usa permisos limitados a los módulos habilitados.

La transacción inserta movimiento y entradas, actualiza proyección/estados y versión del lote, registra auditoría y guarda respuesta idempotente. Los movimientos y entradas son inmutables. Cada entrada contiene estado antes/después y solo puede crearse en la transacción del movimiento. Las restricciones diferidas comprueban árbol físico, ausencia de doble conteo, sumas del ledger, snapshot de la proyección y secuencia de versiones del lote antes del commit.

Un cambio de unidad crea una salida de la unidad anterior y una entrada de la nueva. Una transición de estado sin cambio de cantidad deja una entrada de cantidad cero con estados distintos. Al abrir y retirar dentro del mismo comando, un blíster recién creado puede quedar ya despachado: su identidad y transición se conservan, pero no se cuenta como disponible.

Se usan consultas SQL parametrizadas mediante el driver PostgreSQL en las transacciones de inventario; Drizzle mantiene el esquema y los snapshots de migración. Esta elección permite expresar bloqueos y comprobaciones del libro explícitamente, sin trasladar reglas al navegador.

## Rutas y pruebas

`GET/POST /api/suppliers`, `PATCH /api/suppliers/:id`, `POST /api/receipts`, `GET /api/inventory`, `GET /api/inventory/lots/:id`, comandos POST por lote (`open-box`, `withdraw-blisters`, `open-blister`, `prepare-half`, `adjust`) y `POST /api/inventory/movements/:id/reverse`. Los cuerpos y tipos compartidos están en `packages/domain/src/inventory.ts`.

`tests/unit/inventory.test.ts` comprueba contratos, precisión de costos, conteos y categorías del resumen. `tests/e2e/inventory.spec.ts` comprueba los flujos contra la API y PostgreSQL, incluyendo solicitudes simultáneas, reintentos, rollback multilínea, snapshots, reversas y rechazo de alteraciones históricas. Los resultados ejecutados se documentan en la entrega de Fase 2; la existencia de estos tests no equivale a haberlos ejecutado.
