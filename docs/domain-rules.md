# Reglas permanentes del negocio

Fuentes: prompts de fases 1 y 2 entregados por el propietario y autorización de fase 2 del 4 de noviembre de 2026. Este documento manda sobre ejemplos, imágenes y datos de prueba. El alcance actual incluye catálogo, proveedores, recepción, inventario y autenticación; ventas, cobranza y BCV en vivo siguen fuera de esta fase.

## Catálogo

1. Jerarquía: fruta → variedad → calibre → configuración de empaque → lote.
2. Se admite cualquier fruta importada. El nombre de variedad y la etiqueta del calibre pertenecen a una fruta. Una combinación no puede mezclar la variedad de una fruta con el calibre de otra.
3. Calibre es una clasificación comercial de tamaño. Puede ser `80`, `180`, `70/75` u otra etiqueta; **no es una cantidad de frutas**.
4. Gala 80 con 5 blíster y Gala 180 con 4 blíster son ejemplos editables. No hay bifurcaciones por calibre en el código.
5. La regla habitual puede cambiar. Un lote conserva referencia, versión y número de blíster que se registraron al recibirlo. Editar el catálogo no modifica lotes existentes.
6. El catálogo permite crear y consultar frutas, variedades y calibres, y crear/editar empaques. No elimina productos utilizados por otros registros.

## Proveedores, recepción y lotes

- Proveedores: nombre, identificación opcional, teléfono, notas y estado activo. La edición comprueba versión; desactivar no borra su historia. Un proveedor inactivo no puede recibir nuevas recepciones.
- Una recepción pertenece a un proveedor y tiene referencia única para ese proveedor, fecha, notas y una o varias líneas. Todas las líneas se confirman en una transacción o ninguna se registra.
- La fase 2 recibe cajas cerradas. Cada línea crea un lote con cantidad recibida, costo unitario USD y empaque histórico. El valor habitual procede del catálogo, pero se permite un empaque de 1 a 100 blíster por caja específico de la línea.
- Límite operativo por recepción: 50 líneas y 1.000 cajas en total. No son equivalencias de fruta. Las recepciones mayores se dividen.
- Los datos históricos del lote no se editan después de recibirlo; su versión de inventario avanza con los movimientos. Revertir una recepción conserva su documento, lote y eventos.
- Se utiliza `Almacén principal`; no hay interfaz de sucursales ni transferencias en esta fase. La migración no carga proveedores ni stock ficticio.

## Inventario y conservación

- Un contenedor identifica un recipiente físico; no constituye una cantidad adicional. Cada caja, blíster intacto y media caja preparada ocupa una identidad con saldo 0 o 1; la fruta suelta usa piezas enteras.
- Solo las existencias de los elementos terminales se suman. Una caja cerrada con existencia no tiene blíster interiores contabilizados a la vez. Una caja abierta es un contenedor del contenido restante, sin saldo de caja cerrada.
- Un blíster abierto puede contener fruta suelta contada. Una media caja preparada requiere conteo físico explícito; no es `0,5 × calibre`, ni necesariamente la mitad de los blíster de una caja.
- `counted_pieces = null` significa **cantidad física desconocida**, nunca cero. Al fraccionar fruta se registra un conteo real. El conteo de empaques intactos se conserva por separado de la cantidad de fruta.
- Recepción de 3 cajas de 5 blíster y retiro de 1 blíster: 2 cajas cerradas y 4 blíster intactos en un contenedor abierto. Hay 14 blíster equivalentes; no 3 cajas más 4 blíster. Este retiro interno no factura ni crea deuda.
- Si se cuentan 37 frutas y se entregan 18, deben registrarse 19 restantes. Una media caja preparada no tiene una cantidad fija universal.
- No se permite saldo negativo, ciclos de contenedores ni un contenedor simultáneamente contado junto con sus descendientes.
- Tras vaciar una caja abierta se cambia su estado a vacía. Los recipientes vacíos o retirados permanecen en el historial, pero no aumentan el inventario disponible.
- El retiro consume primero blíster ya disponibles en cajas abiertas y abre cajas cerradas únicamente si hacen falta. Todo ocurre dentro de la misma transacción.
- Los resúmenes separan cajas cerradas, cajas abiertas con contenido, blíster intactos y abiertos, medias cajas preparadas y piezas contadas. La equivalencia en blíster intactos solo incluye cajas cerradas y blíster intactos; no convierte fracciones o fruta suelta.

## Contrato de movimientos implementado

La API de fase 2 aplica esta secuencia a recepción, apertura, retiro, preparación, ajuste y reversa:

1. Validar sesión, comando y clave de idempotencia; calcular una huella del contenido normalizado y del actor autenticado. El cliente no puede elegir el actor.
2. Abrir transacción, bloquear la clave, el árbol, el lote y los saldos afectados en orden estable. Repetir una clave con el mismo contenido y actor devuelve el mismo resultado; reutilizarla con otros datos produce conflicto.
3. Leer empaque del lote, estado y existencias. No consultar servicios externos dentro de esta transacción.
4. Elaborar salidas y entradas compensadas; en fraccionamientos verificar `contado = entregado + restante`. En apertura de caja conservar blíster según la configuración del lote, sin fabricar conteos de fruta.
5. Insertar movimiento y entradas inmutables, actualizar proyecciones y contenedores, registrar auditoría y respuesta idempotente en la misma transacción.
6. Confirmar todo o revertir todo. Reintentar bloqueos transitorios o una respuesta perdida con la misma clave; nunca emitir un segundo movimiento para el mismo intento.

Las restricciones diferidas de PostgreSQL validan al confirmar el árbol del lote, los saldos no negativos, la ausencia de doble conteo, la suma de entradas por unidad, el estado de la proyección y la secuencia de versiones. El bloqueo del árbol sigue siendo global y conservador: limita escrituras simultáneas entre lotes y requiere revisión antes de una escala mayor.

Movimientos, entradas y auditoría son inmutables. La migración `0005_inventory_history_guard.sql` también impide añadir entradas a un movimiento ya confirmado: deben crearse en su misma transacción y coincidir con sus estados históricos.

Un ajuste exige motivo y cantidades enteras. En fruta suelta la cantidad y las piezas cambian juntas; una media caja conserva un conteo explícito. No se transforma una cantidad desconocida en cero por conveniencia.

La reversa crea un movimiento compensatorio y restaura estados y cantidades anteriores. Solo admite el último movimiento de un lote, una vez, sin movimientos posteriores y sin revertir otra reversa. Los contenedores que se crearon se conservan vacíos. No se permite borrar historial para corregir una operación. Consulta [inventory-model.md](inventory-model.md) para contratos y ejemplos.

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
- Staging está autorizado en una base y recursos exclusivos del proyecto, con HTTPS, sesión y etiqueta `ENTORNO DE PRUEBAS`. La URL confirmada es `https://manzanas.ganamosclub.net`; su publicación efectiva debe comprobarse en la entrega. No se autoriza producción. Los cambios concretos de DNS/proxy u otra infraestructura compartida requieren aprobación específica.
- Credenciales fuera de Git, capturas, logs y documentación. El rol de la aplicación no es superusuario; recibe solo los permisos de catálogo, recepción, inventario, sesiones, auditoría e idempotencia necesarios. La creación de usuarios utiliza el rol de preparación, no un endpoint público.
- Los usuarios invitados comparten las funciones de esta fase; no se inventan roles administrativos. La API exige sesión para las operaciones, valida origen en mutaciones y obtiene el actor del usuario autenticado.
- Historial y auditoría son append-only. Corregir hechos históricos mediante un evento compensatorio, no borrándolos.
- No representar nombres de ejemplo como existencias, ventas o indicadores reales. Staging y pruebas usan bases separadas, y el servidor marca sus nuevas recepciones como DEMO. No copiar inventario comercial real para una demostración.
