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

La primera corrida E2E aprobó 153/154 y detectó la carrera de carga descrita arriba. Sus capturas y trazas se conservaron. La corrida final aprobó **154/154 en una ejecución**, terminada el `2026-11-10T03:36:20.069Z`, con PostgreSQL exclusivo detenido y datos locales anteriores intactos.

El ensayo de producción aislada aprobó entorno vacío, primera recepción, interfaz y API el `2026-11-10T03:44:57.202Z`; su base temporal fue retirada. El primer intento había esperado cuatro blísteres para Gala 100. Se corrigieron exclusivamente dos expectativas del test en `df49b9e940b10c2b4e08ababa215da349beb5131`. El diff desde el runtime `39c5461090debb0b9b17df3105b27170a590a419` contiene solo `tests/production/ux-v3-empty.spec.ts`: no hay diferencia de aplicación ni migraciones. No se atribuye el primer fallo a un PASS retrospectivo.

Staging está saludable en `hotfix-39c5461090de`: 29/29 controles comerciales aprobados el `2026-11-10T03:43:59.198Z`, incluidos tasas, recepción, ventas, abonos, fracciones, rechazo de sobreventa, idempotencia y reimpresión sin escrituras. La actualización conservó todas las filas y verificó recuperación de los respaldos anterior y posterior. Los movimientos de esta prueba son DEMO y ocurrieron exclusivamente en staging.

Al cerrar la preparación, las imágenes estaban construidas y verificadas, todavía sin activar. El respaldo previo del runtime V4.10 fue renovado el `2026-11-10T03:47:21.398622+00:00`: copia cifrada en computadora/VPS y recuperación aislada aprobadas. En ese momento producción continuaba en `642ffae84efd23c14871acf2df7a96fb2e62209e`; el cierre posterior se documenta abajo. No hay migraciones ni vaciado; la autorización de V4.10 no se presenta como aprobación de otra versión.

## Alcance presentado y aprobado

Se aprobó publicar únicamente el runtime `39c5461090debb0b9b17df3105b27170a590a419`, instalar la identidad documental verificada en la configuración privada y corregir el único empaque existente afectado mediante PATCH auditado (Roja normal 100: cuatro a cinco). Las otras tres variedades quedaron corregidas en las opciones habituales, sin crear maestros innecesarios. La inspección inicial y la comprobación antes del comando no encontraron lotes asociados a ese empaque. No se reescribieron lotes, existencias, recepciones ni ventas históricas.

La publicación completó pausa breve de API/web y procesos propios, nuevo respaldo cifrado con escritores detenidos, comprobación de las 16 migraciones sin ejecutar DDL, arranque del código verificado y reanudación del recolector. Después se verificaron acceso real de solo lectura, catálogo/existencias, configuración privada de notas y respaldo posterior restaurado. Conservó acceso, tablet y mercancía registrada; no cambió DNS, Caddy ni otros proyectos. Ver [evidencia](verificacion-v4-11.json) y [PR #12](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/12).

## Cierre de publicación

V4.11 publicada y verificada: runtime `39c5461090debb0b9b17df3105b27170a590a419`, rama `fix/calibre-100-emisor-v4-11`, PR #12. Aprobación expresa del propietario recibida y aplicada. 444 unitarias, 154/154 E2E, 13 casos de producción aislada, 29 controles de staging y 21 de acceso real PASS. Todas las filas conservadas durante el cambio de código; después se corrigió un empaque mediante PATCH auditado, con existencias y otras configuraciones intactas. Las cuatro variedades tradicionales calibre 100 ofrecen cinco blísteres. Nota simplificada con emisor/RIF privados, contado/crédito, tasas y firmas. PDF comprobado en memoria con la imagen instalada, sin registrar venta; interfaz móvil/tablet verificada. 16 migraciones sin DDL, acceso/tablet conservados, recolector reanudado y cuatro métodos disponibles al comprobar. Respaldo posterior cifrado PC/VPS y restaurado PASS `2026-11-10T04:04:51.710248+00:00`. **No repetir la publicación ni ningún vaciado: los socios ya registraron mercancía.** Ver docs/calibre-emisor-v4-11.md y docs/verificacion-v4-11.json.

El propietario aprobó expresamente «Sí, publicar V4.11 con ese alcance». La ventana completó respaldo nuevo/restauración, comprobación de historia y arranque sin migraciones. El PATCH de catálogo confirmó que no había lotes afectados y que el inventario completo y los demás empaques permanecieron iguales. Se verificaron las cuatro opciones calibre 100 a cinco blísteres.

La comprobación del PDF cargó automáticamente la identidad instalada con el usuario normal del contenedor y generó Carta/A4 solo en memoria: encabezado formal, condición, mercancía, total y acuerdo/tasas presentes; observaciones, abonos y saldo ausentes. No se crearon ventas de prueba ni hubo acceso a la base desde esa comprobación. La revisión visual previa y las pruebas geométricas no sustituyen la impresión física.
