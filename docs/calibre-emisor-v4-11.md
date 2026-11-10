# Calibre 100 y emisor de nota de entrega — V4.11

Ampliación solicitada durante la publicación de V4.10: corregir a cinco blísteres las manzanas tradicionales Roja normal/Roja, Verde, Amarilla y Gala calibre 100; mostrar razón social y RIF del negocio en la nota de entrega, conservando su diseño.

## Implementación

- Sugerencia específica para esas cuatro variedades. No modifica Pink Lady, Lady, otros calibres ni otras frutas. La regla no confunde calibre con cantidad de piezas.
- El catálogo ya configurado se corrige mediante comandos normales auditados, con versión e idempotencia. La plantilla permite seleccionar los productos aún no materializados. No se reescriben lotes, snapshots ni recepciones.
- El encabezado de la nota admite razón social, RIF y dirección opcional, con salto de línea y repetición por página. Conserva logo, folio, cliente, mercancía, saldo, firmas y aviso de documento comercial.
- El servidor lee `document-issuer.json`, junto al archivo privado `MM_PRODUCTION_GATE_FILE`, solo en producción. Es una configuración privada, no un secreto de acceso y tampoco forma parte del repositorio. Campos: `legalName`, `rif` y `address` opcional. La ruta de control ya está montada en solo lectura; no se añade un volumen ni una variable de Compose. Los valores reales y el documento fuente no se versionan.
- Si falta la configuración, las instalaciones anteriores conservan el encabezado comercial. Una configuración presente pero inválida se rechaza explícitamente. Las demos no cargan los datos reales. El cliente HTTP no puede enviar un emisor por parámetro.

## Verificación y publicación

Tipos, 444 pruebas unitarias y compilación aprobados localmente. Incluye límites de aplicación de la regla, conservación de un empaque anterior de cuatro blíster, lectura privada y rechazo de identidad inválida, y geometría de Carta/A4 con nombres largos, 50 líneas, firmas y totales. Las vistas previas privadas de cinco líneas fueron renderizadas para revisión visual.

Los primeros intentos conservaron expectativas antiguas de cuatro blísteres en pruebas; se actualizaron para la nueva instrucción, manteniendo casos explícitos de historia inmutable. La primera generación de vista previa usó un directorio de trabajo incorrecto para el logo; se corrigió sin cambiar el logo.

Los recorridos E2E completos están en curso. Staging y publicación de esta ampliación siguen pendientes. Producción está saludable en V4.10 (`642ffae84efd23c14871acf2df7a96fb2e62209e`). No hay migraciones ni vaciado; la autorización de V4.10 no se presenta como aprobación de otra versión.
