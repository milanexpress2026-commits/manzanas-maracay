# Reglas permanentes del negocio

Fuente: prompt de fase 1 entregado por el propietario el 4 de noviembre de 2026. Este documento manda sobre ejemplos, imágenes y datos de prueba. No ampliar la fase sin revisión.

## Catálogo

1. Jerarquía: fruta → variedad → calibre → configuración de empaque → lote.
2. Se admite cualquier fruta importada. El nombre de variedad y la etiqueta del calibre pertenecen a una fruta. Una combinación no puede mezclar la variedad de una fruta con el calibre de otra.
3. Calibre es una clasificación comercial de tamaño. Puede ser `80`, `180`, `70/75` u otra etiqueta; **no es una cantidad de frutas**.
4. Gala 80 con 5 blíster y Gala 180 con 4 blíster son ejemplos editables. No hay bifurcaciones por calibre en el código.
5. La regla habitual puede cambiar. Un lote conserva referencia, versión y número de blíster que se registraron al recibirlo. Editar el catálogo no modifica lotes existentes.
6. En la fase 1 el catálogo permite crear y consultar frutas, variedades y calibres, y crear/editar empaques. No elimina productos utilizados por otros registros.

## Inventario y conservación

- Un contenedor identifica un recipiente físico; no constituye una cantidad adicional.
- Solo las existencias de los elementos terminales se suman. Una caja cerrada con existencia no tiene blíster interiores contabilizados a la vez. Una caja abierta es un contenedor del contenido restante, sin saldo de caja cerrada.
- Un blíster abierto puede contener fruta suelta contada. Una media caja preparada requiere conteo físico explícito; no es `0,5 × calibre`, ni necesariamente la mitad de los blíster de una caja.
- `counted_pieces = null` significa **cantidad física desconocida**, nunca cero. Al fraccionar fruta se registra un conteo real. El conteo de empaques intactos se conserva por separado de la cantidad de fruta.
- Recepción de 3 cajas de 5 blíster y venta de 1 blíster: 2 cajas cerradas y 4 blíster intactos en un contenedor abierto. Hay 14 blíster equivalentes; no 3 cajas más 4 blíster.
- Si se cuentan 37 frutas y se entregan 18, deben registrarse 19 restantes. Una media caja preparada no tiene una cantidad fija universal.
- No se permite saldo negativo, ciclos de contenedores ni un contenedor simultáneamente contado junto con sus descendientes.
- Tras vaciar una caja abierta se cambia su estado a vacía. El prototipo `sellIntactBlisters` solo planifica apertura y salida de blíster: no decide por sí solo el retiro físico de contenedores vacíos.

## Contrato para movimientos futuros

La fase 1 prueba un modelo; no expone endpoints de inventario. La implementación de movimientos seguirá esta secuencia:

1. Validar el comando y su clave de idempotencia; calcular una huella del contenido normalizado.
2. Abrir transacción, bloquear la clave y los saldos afectados en orden estable. Repetir una clave con el mismo contenido devuelve el mismo resultado; con otro contenido produce conflicto.
3. Leer empaque del lote, estado y existencias. No consultar servicios externos dentro de esta transacción.
4. Elaborar salidas y entradas compensadas; en fraccionamientos verificar `contado = entregado + restante`. En apertura de caja conservar blíster según la configuración del lote, sin fabricar conteos de fruta.
5. Insertar movimiento y entradas inmutables, actualizar proyecciones y contenedores, registrar auditoría y respuesta idempotente en la misma transacción.
6. Confirmar todo o revertir todo. Reintentar bloqueos transitorios con la misma clave; nunca emitir una segunda venta.

Los triggers iniciales serializan cambios del árbol de contenedores y validan su estado final al confirmar. Es una protección conservadora del modelo. Antes de habilitar operaciones masivas se deberá optimizar la validación por lote y añadir pruebas de contención, consistencia entre libro y proyección, reversas, transferencias y ajustes. No se afirma que el flujo completo de inventario esté implementado.

## Precios y ventas futuras

- Dos bases de precio por producto y presentación: promoción USD efectivo y regular para bolívares. Ambas referencias están expresadas en USD.
- El propietario puede pactar precio unitario. Se conservan precio de referencia, precio pactado, cantidad, presentación y descripción del producto como instantáneas de la venta.
- 5 cajas pactadas a USD 38 suman USD 190; esto no altera el precio del catálogo.
- Contado o crédito se eligen libremente. No introducir jerarquías de aprobación o bloqueos administrativos.
- Importes en PostgreSQL `numeric(18,4)`; tasas `numeric(20,8)`. En TypeScript se utilizan cadenas decimales y Decimal; no aritmética financiera con `number`. Totales presentados/cobrados se redondean a 2 decimales con criterio explícito.

## Cobros y BCV futuros

- La deuda permanece denominada en USD. Las cuentas por cobrar se derivan de ventas confirmadas y aplicaciones de pagos, no de un saldo editable independiente.
- Un cobro en VES requiere una tasa BCV positiva, oficial, verificada y vigente en el momento del cobro. Se conserva referencia a su registro histórico inmutable.
- Vigencia con intervalo `[valid_from, valid_until)`. Una tasa futura, vencida o no verificada bloquea la conversión; no se reemplaza silenciosamente por la última conocida.
- Nunca usar tasas paralelas ni proveedor alternativo. No afirmar que hay API oficial sin verificarlo.
- Existe la interfaz desacoplada `OfficialRateProvider`. `UnconfiguredBcvProvider` devuelve `null`; no contiene números ficticios. Los valores de los tests son sintéticos y no llegan a la interfaz ni a las semillas.
- Antes de habilitar cobranza se deben implementar verificaciones transaccionales de aplicación máxima por factura/pago, cliente coincidente, redondeo, reversas, tasas e inmutabilidad de documentos confirmados. La estructura SQL por sí sola no es un sistema contable listo.

## Datos y seguridad operativa

- No tocar otras bases, archivos privados, volúmenes, servicios, DNS, firewall ni certificados de proyectos existentes.
- Sin despliegue público ni cambios en el VPS durante esta fase.
- Credenciales fuera de Git, capturas, logs y documentación. El rol de la aplicación no es superusuario y solo tiene permisos para el catálogo, auditoría e idempotencia.
- Historial y auditoría son append-only. Corregir hechos históricos mediante un evento compensatorio, no borrándolos.
- No representar nombres de ejemplo como existencias, ventas o indicadores reales.
