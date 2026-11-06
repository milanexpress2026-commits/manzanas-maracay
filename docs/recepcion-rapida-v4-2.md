# Recepción rápida y catálogo habitual · V4.2

Implementación en validación, rama `feature/recepcion-rapida-v4-2`, desde `476816f` de V4. No acredita todavía una publicación real. Producción observada el 5 de noviembre de 2026 conserva `phase4-2a81817fe2c1`; staging V4 conserva `hotfix-53aeff14b981`. [Brief corregido](referencias/brief-recepcion-rapida-v4-2.txt).

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

El ensayo local de migraciones del 5 de noviembre pasó con base nueva de 15 migraciones y actualización11→13→14→15: 35 tablas históricas, referencias, proveedores, costos, acuerdos y hashes anteriores preservados. Los números internos de documentos anteriores permanecen NULL. Se retiraron las dos bases temporales. Las pruebas de aplicación y navegador se registrarán al cerrar la validación integrada.

La inspección real encontró datos cargados nuevamente por el propietario y ningún maestro llamado «Manzana Gala». No hay corrección ni borrado pendiente sobre ese nombre. Antes de promover se vuelve a verificar el estado; esta observación no presupone que la base siga igual.

La promoción requiere candidato exacto, imágenes, respaldo externo cifrado y recuperación aislada, comprobación13→15 sobre copia del respaldo y aprobación expresa del apartado 8. Después se detienen solo los escritores propios durante la nueva copia y migración; se conserva PostgreSQL, volumen, acceso y alias. No se modifica DNS, Caddy ni otros proyectos. Si falla, se conserva el bloqueo para inspección; no se arranca código de 13 migraciones sobre esquema de 15 ni se restaura por cuenta propia sobre nuevas operaciones.

El recolector propio conserva BCV oficial y Binance BUY USDT/VES, TLS, fechas e historial. Una observación futura o vencida no habilita cobros. La evidencia final distingue fuentes consultadas de tasas realmente vigentes. PDF comerciales, sin prueba física Android hasta que se compruebe la versión y operación en la tablet del negocio.

[Primera recepción para los dueños](checklist-propietarios-v4-2.md).
