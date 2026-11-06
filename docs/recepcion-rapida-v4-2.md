# Recepción rápida y catálogo habitual · V4.2

Implementación verificada, rama `feature/recepcion-rapida-v4-2`, desde `476816f` de V4. Lista para solicitar la aprobación final de producción. Producción conserva `phase4-2a81817fe2c1`; staging V4.2 ejecuta `hotfix-80b186f22b58`, con búsqueda de clientes completa. [Brief corregido](referencias/brief-recepcion-rapida-v4-2.txt).

## Operación

El catálogo habitual aparece sin crear todos los productos posibles. Las opciones incluyen Manzana tradicional y granel, Pera, Kiwi, Uva roja/morada/verde y las frutas adicionales comunicadas. Seleccionar no crea stock ni precios. Al guardar una recepción se materializan únicamente sus productos, dentro de la misma transacción del documento, lotes, existencias, costo, auditoría y respuesta idempotente. Coincidencias exactas normalizadas se reutilizan; no se fusionan alias ni se renombra historia.

Recepción permite varias frutas, cantidades y costos confirmados. Proveedor, referencia externa, fecha y notas quedan en detalles opcionales. Un proveedor omitido es NULL y se muestra «Sin proveedor indicado»; no se crea un proveedor genérico. El número interno viene del servidor y puede tener saltos por operaciones rechazadas: es único, no un correlativo fiscal sin huecos.

La primera compra pide costo real positivo. Las siguientes ofrecen el último costo confirmado, con botón de aceptación; no lo heredan silenciosamente. Se verifica que la propuesta no haya cambiado mientras se revisaba. FIFO y costo de lotes previos permanecen inmutables. La lista de precios solo cambia por elección explícita.

Manzana tradicional con blíster usa cuatro para calibre menor o igual a 100, cinco para superior a 100. Una excepción explícita se conserva solo en el lote con su motivo. Las configuraciones confirmadas distintas se preservan y requieren revisión al recibir. Pera no recibe esa regla; no se inventa conteo ni preparación de medias. Kiwi conserva caja de 10 kg/media de 5 kg; granel caja/media comercial sin piezas; uva solo caja. Las frutas adicionales requieren confirmar su presentación.

Búsqueda, favoritos, recientes y opciones ocultas pertenecen a este dispositivo y acceso; ocultar no borra el catálogo. El borrador queda ligado al usuario y entorno, sin contraseña ni cookie almacenada en él. Una confirmación pendiente conserva cuerpo, hash y clave antes de enviar. Pérdida de respuesta, recarga y cierre de sesión no crean una nueva clave. Los cambios de empaque desde la selección exigen revisión.

## Migración aditiva

`0014_quick_receipts` es la decimoquinta migración. Conserva byte por byte las catorce anteriores:

- Permite proveedor nulo en compras y lotes, manteniendo claves foráneas; referencia externa opcional.
- Añade número interno BIGINT nullable a históricos, sin valor predeterminado durante el alta de columna. Después establece la secuencia para nuevos documentos, índice único parcial y protección de inmutabilidad.
- Añade índice para consultar costo previo y valida que cada lote nuevo coincida con su documento/línea, incluido proveedor nulo, costo, variante y cantidad.
- El rol de aplicación recibe USAGE/SELECT sobre la secuencia, nunca UPDATE. No se amplían permisos del recolector.

Las lecturas de lotes usan LEFT JOIN con proveedores para conservar filas sin proveedor. Solicitudes antiguas mantienen parser y hash para recuperar respuestas ya confirmadas; fecha y número generados no forman parte del hash enviado.

## Verificación y promoción

El candidato de aplicación `80b186f22b58b77a94a849c32d1d09f342478fd7` pasó tipos, compilación de API/web, 247 pruebas unitarias, **98/98 pruebas de navegador** y **13/13 pruebas de producción aislada**. La suite completa terminó el 6 de noviembre de 2026, 05:03:01 UTC, con `npm run test:e2e -- --fresh-db`, conservando aserciones y límites de tiempo. El clúster nuevo quedó detenido y el hash de control de la base local anterior permaneció idéntico. El aislamiento tiene ocho pruebas de protección aprobadas. No quedaron servicios locales de prueba escuchando.

La cobertura incluye catálogo habitual sin stock ficticio, tres productos sin proveedor, costo real y costo anterior aceptado, recepción concurrente, numeración, conservación física/FIFO, excepción por lote, venta inmediata, crédito, abonos, PDF y recuperación de la misma recepción tras pérdida de respuesta, recarga, cierre de sesión y 401. Las vistas de 390/800/1366 pasaron accesibilidad y límites de pantalla. La venta automática conserva segundos y milisegundos; una fecha manual sigue siendo explícita.

La búsqueda de clientes usa el servidor, páginas adicionales y recuperación del seleccionado por ID. Conserva la selección al buscar sin resultados, volver al borrador o abrir un enlace, y admite nombre, teléfono y RIF. La regresión crea expresamente un cliente fuera de los primeros 200 y comprueba su venta. No se borraron fixtures para ocultar el límite anterior.

El ensayo local de migraciones pasó con base nueva de 15 migraciones y actualización 11→13→14→15: 35 tablas históricas, referencias, proveedores, costos, acuerdos y hashes anteriores preservados. Los números internos de documentos anteriores permanecen NULL. Se retiraron las dos bases temporales. Los quince SQL y el migrador no cambiaron durante las correcciones de interfaz.

Staging ejecuta `hotfix-80b186f22b58`: completó la migración 14→15 y la actualización posterior de código con historial conservado, respaldos restaurados y 16 comprobaciones autenticadas, incluidas ambas tasas vigentes al comprobarlas. Las imágenes equivalentes de producción están construidas. Una copia real de producción se restauró y migró 13→15 con el candidato exacto: 36 tablas preservadas, permisos comprobados y recursos temporales retirados. La copia externa permanece cifrada en la computadora autorizada.

La inspección real encontró datos cargados nuevamente por el propietario y ningún maestro llamado «Manzana Gala». No hay corrección ni borrado pendiente sobre ese nombre. Antes de publicar se vuelve a verificar el estado: la base real continúa en `phase4-2a81817fe2c1` y esta evidencia no presupone que sus datos permanezcan iguales.

La promoción está preparada y requiere la aprobación expresa del apartado 8. Después se detienen solo los escritores propios durante un nuevo respaldo y la migración; se conservan PostgreSQL, volumen, acceso y alias. No se modifica DNS, Caddy ni otros proyectos. Ante un fallo se mantiene el bloqueo para inspección: no se arranca código de 13 migraciones sobre esquema de 15 ni se restaura sobre nuevas operaciones por cuenta propia.

El recolector conserva BCV oficial y Binance BUY USDT/VES, TLS, fechas e historial. Una observación futura o vencida no habilita cobros. Los PDF son comerciales. La comprobación física en la tablet Android queda pendiente y se distingue de la emulación del navegador.

[Evidencia estructurada](verificacion-v4-2.json) · [Cambio exacto y recuperación](promocion-v4-2.md) · [Primera recepción para los dueños](checklist-propietarios-v4-2.md).
