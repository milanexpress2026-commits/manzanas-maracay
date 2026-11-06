# V4.5 · Recibir cantidades y escribir el precio al vender

La operación nueva recibe mercancía sin pedir costos ni listas y permite escribir el precio positivo de cada venta. Conserva los documentos históricos y el inventario físico. Esta página documenta la implementación; el despliegue y las pruebas se registran por separado en la [matriz de aceptación](matriz-aceptacion-v4-5.md).

## Punto de partida comprobado

Rama `feature/operacion-simple-v4-5`, creada desde `bef19d9aa57245f4d20582cd636aa21068142361` de V4.2. El PR #6 sigue abierto, sin merge ni reescritura. La inspección de solo lectura del 6 de noviembre de 2026 a las 11:31 UTC encontró producción `phase4-2a81817fe2c1` con 13 migraciones y staging `hotfix-80b186f22b58` con 15. La URL pública seguía en producción fase4, saludable y autenticada. No se ha aplicado V4.5 a producción durante esta preparación.

El [brief maestro](referencias/brief-operacion-simple-v4-5.txt) sustituye decisiones contradictorias anteriores. No se encontró una implementación V4.3/V4.4 intermedia: la comparación de código verificable es contra V4.2. Las diferencias solicitadas respecto a las instrucciones anteriores son las siguientes; no se atribuye a V4.4 un código que no fue inspeccionado.

| Área | Cambio de V4.5 |
|---|---|
| Recepción | Contrato v3 sin costo/precio, varias líneas, proveedor NULL y folio automático. Los parsers v1/v2 conservan reintentos históricos. |
| Inventario | Costo desconocido NULL permitido al abrir, separar, vender, ajustar y revertir. Cantidades y origen físico conservan transacción, bloqueo e idempotencia. |
| Ventas | Contrato v2 con precio manual positivo por línea; no consulta ni crea `price_items`. Precio de referencia NULL y sin descuento inventado. |
| Acuerdo | Divisa/BCV explícito e independiente de contado/crédito y del precio escrito. Ningún abono modifica el precio original. |
| USDT | Moneda recibida USDT y aplicación 1:1; referencia Binance BUY en Bs. opcional, separada de una conversión VES. |
| Bolívares | Cotización verificada según acuerdo, revisada por identidad. Liquidación exacta con redondeo decimal auditable, sin residuo ficticio. |
| Catálogo | Tres manzanas granel con 235/PC, peras Forelle/Packham con lista exacta y cuatro alimentos separados con unidad explícita. |
| Documentos | Comprobante, recibo y nota de entrega consultables; plantilla sobria, reimpresión sin nuevas salidas. |

## Migración aditiva

`0015_simple_operation_v45.sql` es la decimosexta migración. Conserva las primeras quince. Permite NULL en costos de recepción/lotes/asignaciones/ventas y en la referencia de precio manual; no actualiza importes de filas antiguas. Añade etiquetas comerciales a configuración y snapshots de lote/línea; un empaque con lotes no puede reclasificarse. Añade referencia USDT informativa y ajuste de redondeo al pago.

Las sumas de costo interno preservan NULL si alguna fuente es desconocida. Los valores conocidos se concilian por origen histórico; ninguna pantalla, respuesta operativa o PDF presenta una utilidad ficticia. El verificador de recuperación admite stock de costo desconocido y mantiene las comprobaciones del libro físico y de la proyección histórica.

Las cotizaciones vigentes se comprueban al insertar un pago nuevo. La validación de un recibo histórico utiliza su fecha original; recuperar un respaldo no depende de que su tasa siga vigente hoy. Si la referencia informativa USDT vence en la frontera de inserción, se omite sin bloquear el pago 1:1 y la auditoría refleja esa omisión. Un pago VES nuevo sí exige cotización vigente.

## Liquidación decimal

Se recibe un monto en Bs. y se conoce el USD explícitamente aplicado a la venta o al reparto de comprobantes. Si `Bs recibidos = round(USD aplicado × tasa, 2)`, se conserva ese USD aplicado. Fuera de esa igualdad se convierte mediante `round(Bs / tasa, 2)` y se exige que el reparto coincida. Se registra la diferencia entre ambos cálculos en `conversion_rounding_usd`.

La tolerancia corresponde exclusivamente al redondeo de medio céntimo VES del importe mostrado. No permite perdonar un porcentaje o una cantidad arbitraria de deuda USD. API, interfaz y PostgreSQL usan Decimal/NUMERIC; el recibo puede explicar el ajuste. Cambiar una cotización después no revalúa recibos anteriores.

## Uso y límites

La [guía de los socios](guia-socios-v4-5.md) explica recepción, precio escrito y cuatro métodos de cobro. Los empaques no confirmados se solicitan solo al recibir el producto correspondiente. Packcam, Lady y granel histórico sin variedad conservan identidad e historia; no se fusionan ni redistribuyen.

La prueba física de la tablet Android, la selección del WhatsApp corporativo, la suscripción push real y la impresión en HP Smart Tank215 requieren ese dispositivo y al operador. La emulación y los PDF renderizados se registran como tales. No se simula una prueba con personas que no participaron. Los documentos siguen siendo comerciales, sin homologación fiscal.

La promoción exige SHA final revisado, pruebas vinculadas, respaldo cifrado en la computadora y el VPS, recuperación aislada y aprobación operativa según §11 del brief. Se intervienen únicamente API/web y migraciones propios; DNS, Caddy y otros servicios quedan fuera del cambio. Después de migrar no se arranca código anterior incompatible. Si hubiera nuevas operaciones reales, no se restaura una copia antigua por cuenta propia.
