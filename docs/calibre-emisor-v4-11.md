# Calibre 100 y emisor de nota de entrega — V4.11

Ampliación solicitada durante la publicación de V4.10: corregir a cinco blísteres las manzanas tradicionales Roja normal/Roja, Verde, Amarilla y Gala calibre 100; mostrar razón social y RIF del negocio en la nota de entrega, conservando su diseño.

## Implementación

- Sugerencia específica para esas cuatro variedades. No modifica Pink Lady, Lady, otros calibres ni otras frutas. La regla no confunde calibre con cantidad de piezas.
- El catálogo ya configurado se corrige mediante comandos normales auditados, con versión e idempotencia. La plantilla permite seleccionar los productos aún no materializados. No se reescriben lotes, snapshots ni recepciones.
- El encabezado de la nota admite razón social, RIF y dirección opcional, con salto de línea y repetición por página. Conserva logo, folio, cliente, fecha, mercancía, cantidades, precios, total, firmas y aviso de documento comercial.
- Aclaración posterior del propietario: nota sencilla, sin observaciones, abonos ni saldo actual. Muestra contado/crédito y conserva la explicación de tasas/acuerdo, que el propietario pidió mantener. El comprobante de venta y los recibos mantienen su información contable; los datos originales no se eliminan.
- La batería completa detectó una carrera al revisar un abono antes de cargar sus comprobantes. El botón espera la lista y los rechazos de selección usan texto claro. La recuperación de un abono ya enviado no depende de volver a encontrar una deuda pendiente. La prueba de recuperación retiene deliberadamente la respuesta del listado para comprobar este orden.
- El servidor lee `document-issuer.json`, junto al archivo privado `MM_PRODUCTION_GATE_FILE`, solo en producción. Es una configuración privada, no un secreto de acceso y tampoco forma parte del repositorio. Campos: `legalName`, `rif` y `address` opcional. La ruta de control ya está montada en solo lectura; no se añade un volumen ni una variable de Compose. Los valores reales y el documento fuente no se versionan.
- Si falta la configuración, las instalaciones anteriores conservan el encabezado comercial. Una configuración presente pero inválida se rechaza explícitamente. Las demos no cargan los datos reales. El cliente HTTP no puede enviar un emisor por parámetro.

## Verificación y publicación

Tipos, 444 pruebas unitarias y compilación aprobados localmente. Incluye límites de aplicación de la regla, conservación de un empaque anterior de cuatro blíster, lectura privada y rechazo de identidad inválida, y geometría de Carta/A4 con nombres largos, 50 líneas, firmas y totales. Las vistas previas privadas de cinco líneas fueron renderizadas para revisión visual.

Los primeros intentos conservaron expectativas antiguas de cuatro blísteres en pruebas; se actualizaron para la nueva instrucción, manteniendo casos explícitos de historia inmutable. La primera generación de vista previa usó un directorio de trabajo incorrecto para el logo; se corrigió sin cambiar el logo.

La primera corrida E2E aprobó 153/154 y detectó la carrera de carga descrita arriba. Sus capturas y trazas se conservaron. Tras la corrección y la nueva instrucción de simplificar la nota se ejecutarán los recorridos finales. Staging y publicación de esta ampliación siguen pendientes. Producción está saludable en V4.10 (`642ffae84efd23c14871acf2df7a96fb2e62209e`). No hay migraciones ni vaciado; la autorización de V4.10 no se presenta como aprobación de otra versión.
