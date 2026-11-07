# Plan de promoción V4.7

**Estado: preparación; producción aún no autorizada ni actualizada.** El candidato es `82cd5ab579fbbc50cf852774aca47847cc388fa5`, en `feature/cierre-beta-v4-7`. La conclusión sigue siendo **APTA SOLO PARA PRUEBAS** hasta completar la evidencia operativa y obtener la autorización concreta del propietario. Este documento describe la intervención, no registra una aprobación.

## Fuente, origen y destino

| Elemento                    | Identidad o estado comprobado                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producción actual           | `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`, release `phase4-2a81817fe2c1`, 13 migraciones                                                                                     |
| Candidato                   | `82cd5ab579fbbc50cf852774aca47847cc388fa5`, release propuesta `phase4-82cd5ab579fb`, 16 migraciones                                                                           |
| Archivo inmutable SHA-256   | `1fd2f2bed3fd2352b1f8ad33d1303b71baf158b5a87414aba90d46941a79a481`                                                                                                            |
| Runtime                     | Node `24.22.1`, pin oficial `node:24.22.1-bookworm-slim@sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d`                                              |
| Staging                     | `hotfix-82cd5ab579fb`, saludable, 16 migraciones idénticas, conservación de filas y smoke 21/21 PASS                                                                          |
| Preparación de producción   | Fuente subida e imágenes finales construidas/verificadas el `2026-11-07T02:06:29.851194Z`; NO activadas                                                                       |
| Respaldo/restore real final | PASS respaldo actualizado cifrado/recuperado `2026-11-07T03:05:52.645964Z` y ensayo real13→16 `02:22:07.305671Z`; nuevos respaldos durante/después de la promoción pendientes |
| Autorización operativa      | PENDIENTE: SHA exacto, tres migraciones, recolector, ventana de API/web y dispatcher push                                                                                     |

La QA Linux del SHA candidato aprobó **353/353 unitarias**, tipos/builds, **15/15 dirigidos**, **130/130 E2E en una ejecución**, **13/13 producción aislada** y migraciones fresh16/13→16/14→16/15→16. Fuente, lockfile y Node se comprobaron antes y después de cada fase; las bases temporales se retiraron. Véanse [verificación pública](verificacion-v4-7.json), [auditoría](auditoria-v4-7.md) y [matriz](matriz-aceptacion-v4-7.md).

## Evidencia real previa aprobada

Las imágenes de producción están construidas y verificadas para el SHA exacto; **no están activas**:

| Imagen       | Identidad                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Herramientas | `sha256:231f63fe74e06566df287cd10b9aa8814082ceac48888532e8d13504e71e0994` |
| API          | `sha256:84bc798589dced1af6c22cc570ea25a3e3cc43fc3ddd643f9c9df3d123dc06c8` |
| Web          | `sha256:e1be50e62033296424976a0ee9f1e1063fef3c93b171724417df33c5d3d81d3e` |

El respaldo del origen real aprobó el **2026-11-07T02:15:54.628405Z**: copia externa AES-256-GCM con clave protegida por DPAPI, recuperación desde esa copia y el mismo cifrado verificado en almacenamiento propio del VPS. No se publican archivos privados, identificadores de base ni huellas del respaldo.

El ensayo real aislado del candidato aprobó **13→16 el 02:22:07.305671Z**: 36 tablas y sus filas históricas conservadas, acuerdos originales intactos, integridad de esquema13 restaurado y esquema16, consultas efectivas del rol app y privilegios del recolector verificados. No tocó la base real; retiró sus recursos y preservó contenedores preexistentes. El recolector del ensayo permaneció NOLOGIN y no se inventaron tasas.

**`acl16RoundtripRestored: false`** sigue pendiente: todavía no existe evidencia del respaldo posterior a publicar esquema16 y de su recuperación con las ACL finales. El respaldo de la ventana debe ser nuevo y posterior al STOP; el PASS previo no lo sustituye. El smoke comercial DEMO de staging aprobó 21/21 comprobaciones el `2026-11-07T03:17:34.753Z`; el detalle y su límite están registrados más abajo.

El respaldo previo se refrescó el **2026-11-07T03:05:52.645964Z**, con copia cifrada PC/VPS, recuperación desde la externa y limpieza PASS. Sigue siendo obligatorio otro respaldo posterior al STOP; no se reutiliza el previo como punto de recuperación de la ventana.

Staging también aprobó un **smoke comercial DEMO 21/21 a las 03:17:34.753Z**: recepción de dos cajas con proveedor/costo NULL, venta de una a USD40 manual/crédito, abono USDT40 1:1, existencia una caja y deuda cero. Replays exactos de las tres operaciones, catálogo sin tarifas, dos GET del PDF y comparación de sus lecturas API sin cambios; tasas antes/después y logout PASS. Es un escenario pequeño, sin transacciones de producción ni sustitución de la suite completa.

El intento anterior de las 02:52:10.645Z se detuvo por una expectativa incorrecta del helper sobre la respuesta POST de configuración. Solo había confirmado tres maestros QA. Se corrigió a GET catálogo, pasaron 13 pruebas offline y se reanudó el mismo journal sin duplicar maestros ni cambiar la aplicación. La evidencia de ambos intentos se conserva.

**Preparación cerrada para autorización exacta.** No queda código ni una suite runtime adicional pendiente. Restan la aprobación operativa, los guards/respaldo de la ventana, despliegue y smoke real, respaldo/restore posterior16 y las verificaciones físicas indicadas.

## SQL que se aplicaría

V4.7 no añade una migración. Producción conserva sus trece SQL previos y recibe únicamente estos tres archivos, en orden. Los dieciséis SQL y el journal se contrastan con la fuente inmutable antes de ejecutar.

| Migración                      | SHA-256 exacto                                                     | Cambio principal                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0013_agreed_settlement_rates` | `a5f58f04dd9b473af1d6782024f8a1ef16e9562ccbcf5162f49f2ae9c922d268` | Caché histórica USDT, acuerdo de cobro persistido y vínculo del pago con la fuente de conversión. Las ventas anteriores quedan identificadas como `legacy_bcv`; no se recalculan sus importes.                                                         |
| `0014_quick_receipts`          | `5180bfb6b1d935ae4b6da71bafd81f18e00530afc94f732f09e3e8c310afed57` | Proveedor y referencia externa opcionales; número interno único mediante secuencia, índice parcial y guard de contexto. Los números históricos permanecen NULL; no se renumeran documentos.                                                            |
| `0015_simple_operation_v45`    | `391b0bb5c7ef33d166eeda8bb774f59aab2c31d8ab62720421a8117901e5b8fd` | Recepciones sin costo y propagación íntegra de costo desconocido, precio manual, etiqueta de unidad comercial y snapshots, referencia informativa USDT y redondeo VES validado. Reemplaza validadores manteniendo costos y precios históricos exactos. |

La migración no ejecuta seed, no prepara catálogo, no altera los maestros cargados por los dueños y no crea stock, ventas, abonos ni cotizaciones ficticias. La conservación compara cantidades y huellas de **todas las filas previas**, incluidos datos comerciales, costos conocidos o NULL, movimientos, auditoría, comandos idempotentes, acceso, dispositivos y avisos. Se excluyen de la comparación solo campos nuevos legítimos; sus defaults e invariantes se verifican por separado. Una coincidencia de conteos sola no basta.

Los permisos conservan API con lectura de las cachés de tasas, sin facultad de insertar cotizaciones. La secuencia de recepciones concede el uso/lectura necesarios, sin UPDATE para fijar valores. El recolector dedicado puede leer su binding y cachés e insertar observaciones en BCV/USDT; no recibe acceso a datos comerciales, UPDATE/DELETE de tasas, membresías ni privilegios administrativos. El restore verifica permisos efectivos y consultas reales bajo el rol de aplicación.

## Gates antes de la intervención

1. Verificar nuevamente release, binding de base, trece hashes, estado real y servicios propios; mantener íntegra la comparación de servicios ajenos. El registro actual de la tablet y el historial de avisos se conservan, sin desactivar, reemplazar ni volver a suscribir el dispositivo.
2. Completar subida/construcción de las imágenes exactas y comprobar sus identidades sin activarlas. Mantener Caddy, DNS, redes compartidas y aplicaciones ajenas sin cambios.
3. Crear un respaldo real reciente, cifrado con AES-256-GCM en el equipo externo y en almacenamiento propio del VPS; la clave del equipo permanece protegida por DPAPI. Recuperar desde la copia externa y verificar integridad, acceso efectivo con el rol app y limpieza aislada. El guard requiere evidencia de recuperación de menos de una hora.
4. Ensayar sobre copia real aislada la actualización 13→16 y el verificador del candidato. Nunca ejecutar el ensayo contra la base real. Conservar evidencia de historia, permisos y eliminación exclusiva de los recursos temporales.
5. Presentar una solicitud única y concreta al propietario cuando los gates anteriores estén aprobados. La aprobación debe identificar el SHA `82cd5ab579fbbc50cf852774aca47847cc388fa5`, las migraciones `0013/0014/0015`, el recolector BCV/USDT, la pausa de API/web propios y la ventana de su dispatcher push. El registro debe incluir **`pushDispatcherWindow: true`** además de las autorizaciones del upgrade y recolector, y quedar ligado al origen/base comprobados. El operador rechaza una aprobación genérica, vencida o de otro SHA.

## Ventana de escritores y dispatcher

La intervención **no promete durar treinta segundos**. Los 30 segundos son únicamente la gracia de apagado de los servicios propios; respaldo, cifrado, recuperación, migración y comprobaciones pueden prolongar la pausa. No se inicia la ventana mientras falte un gate.

Antes del STOP se exige **`claimedCount = 0`, `uncertainCount = 0`, `eligibleCount = 0`**. El cálculo de elegibles cubre también el criterio del dispatcher anterior. Se capturan cantidades y huellas de dispositivos/avisos sin publicar sus identificadores ni secretos. Una tablet activa es legítima y no se elimina para satisfacer el guard.

Con autorización exacta se detienen exclusivamente API y web de Manzanas Maracay. PostgreSQL conserva identidad y datos. Tras confirmar la parada se repiten los tres ceros y la igualdad exacta de dispositivos y avisos; una carrera o aviso elegible detiene el procedimiento para revisión, sin cancelar, enviar ni reintentar avisos artificialmente.

Se crea entonces **otro respaldo nuevo**, posterior al STOP, que incluye cualquier dato legítimo añadido desde el preflight. Debe tener identidad distinta del respaldo previo, copias cifradas dentro/fuera del VPS y recuperación aislada comprobada. Solo después se aplican las tres migraciones con el dueño limitado y se comparan historia, costos, hashes y restricciones. Antes de activar se repite la preservación del dispatcher tras la migración.

El gate de operación, la referencia de release y los servicios propios se actualizan únicamente cuando todas las verificaciones pasan. La igualdad de dispositivos/avisos aplica a la ventana detenida; después del arranque la actividad legítima del dispatcher puede continuar y no se presenta como una alteración de historia del upgrade.

## Recolector, comprobaciones finales y respaldo posterior

El recolector autorizado usa la imagen exacta, un rol propio de permisos mínimos, red de salida propia y cron de cinco minutos. La API no consulta fuentes externas dentro de transacciones ni escribe cachés. Se exige una observación real validada con TLS antes de declarar cada fuente disponible; BCV/USDT se verifican por separado, sin copiar datos de staging ni inventar tasas para aprobar una pantalla. USD/USDT 1:1 conserva su comportamiento cuando falta una cotización informativa; VES requiere la fuente vigente que corresponda al acuerdo.

La verificación real posterior es autenticada y de solo lectura comercial: release/entorno/readiness, sesión y revocación, catálogo, inventario, cuentas, tasas y rutas privadas, con anónimo denegado. Si existe una venta real, se comprueba también su PDF Carta/A4/descarga; si todavía no hay ventas reales, esa comprobación positiva se marca pendiente sin crear una operación ficticia. No se crean fixtures, clientes, compras, ventas o pagos sintéticos en producción, ni se fuerza un push o WhatsApp. Se conservan la cuenta del propietario y la suscripción de su tablet.

Después de la promoción se necesita otro respaldo real de dieciséis migraciones, cifrado dentro/fuera del VPS y restaurado de manera aislada. Debe comprobar las ACL del recolector, lectura efectiva de la app, restricciones y datos. Ese PASS sigue pendiente; un backup anterior o una exitosa migración sintética no lo acredita.

## Recuperación si falla

Antes de iniciar migraciones se conserva el estado comprobado y se revisa el fallo; no se improvisa una nueva aprobación ni se sobrescriben controles ajenos. Si falla después de detener escritores, estos permanecen retenidos para inspección. Se preservan PostgreSQL, respaldos y evidencia; no se borran volúmenes ni se repite automáticamente una ventana push previa.

Después de aplicar esquema 16 **no se arranca el código antiguo sobre ese esquema**. La recuperación prioriza un arreglo compatible y verificado. Restaurar un respaldo exige un procedimiento aparte, alcance y aprobación concretos; nunca se restaura uno antiguo encima de ventas o abonos reales posteriores ni se considera un cambio de enlace de release como rollback de base. No hay rollback destructivo automático.

## Cierre pendiente

La publicación se acreditará con fecha, SHA e identidades reales, smoke privado, conservación de datos/dispositivos/avisos/servicios ajenos y respaldo posterior restaurado. Hasta entonces, las funciones V4.7 no se presentan como disponibles en la URL real. Tras publicar, el propietario comprobará una operación con mercancía real y el flujo de la [guía HP](guia-impresion-hp-v4-7.md). **Tablet y HP físicas siguen pendientes**: las capturas emuladas y PDF renderizados no certifican impresión en papel ni uso sin supervisión.
