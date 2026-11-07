# Plan de promoción V4.7

**Estado: V4.7 publicada y saludable en producción.** Runtime `82cd5ab579fbbc50cf852774aca47847cc388fa5`, release `phase4-82cd5ab579fb`, 16 migraciones, desde 2026-11-07T03:33:53.831611Z. La aprobación expresa, ventana, preservación y respaldo posterior están acreditados. La beta general continúa **APTA SOLO PARA PRUEBAS** mientras siga abierta la revisión P1 stock/UX V4.8 y falten pruebas físicas. La secuencia de gates de este documento conserva el procedimiento ejecutado; no solicita repetir la promoción.

## Fuente, origen y destino

| Elemento                    | Identidad o estado comprobado                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origen anterior             | `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`, release `phase4-2a81817fe2c1`, 13 migraciones                                                                                                                            |
| Producción actual           | `82cd5ab579fbbc50cf852774aca47847cc388fa5`, release activa `phase4-82cd5ab579fb`, 16 migraciones                                                                                                                     |
| Archivo inmutable SHA-256   | `1fd2f2bed3fd2352b1f8ad33d1303b71baf158b5a87414aba90d46941a79a481`                                                                                                                                                   |
| Runtime                     | Node `24.22.1`, pin oficial `node:24.22.1-bookworm-slim@sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d`                                                                                     |
| Staging                     | `hotfix-82cd5ab579fb`, saludable, 16 migraciones idénticas, conservación de filas y smoke 21/21 PASS                                                                                                                 |
| Preparación de producción   | Fuente subida e imágenes finales construidas/verificadas el `2026-11-07T02:06:29.851194Z`; activas desde03:33:53.831611Z                                                                                             |
| Respaldo/restore real final | PASS respaldo actualizado cifrado/recuperado `2026-11-07T03:05:52.645964Z` y ensayo real 13→16 `02:22:07.305671Z`; ventana 03:31:26.277834Z; post16 03:40:44.976258Z y último respaldo con BCV 05:21:06.597199Z PASS |
| Autorización operativa      | APROBADA expresamente: SHA 82, tres migraciones, recolector y ventana de API/web/dispatcher push                                                                                                                     |

La QA Linux del SHA candidato aprobó **353/353 unitarias**, tipos/builds, **15/15 dirigidos**, **130/130 E2E en una ejecución**, **13/13 producción aislada** y migraciones fresh16/13→16/14→16/15→16. Fuente, lockfile y Node se comprobaron antes y después de cada fase; las bases temporales se retiraron. Véanse [verificación pública](verificacion-v4-7.json), [auditoría](auditoria-v4-7.md) y [matriz](matriz-aceptacion-v4-7.md).

## Evidencia real previa aprobada

Las imágenes de producción se construyeron y verificaron antes de la ventana; ahora están activas para el SHA exacto:

| Imagen       | Identidad                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Herramientas | `sha256:231f63fe74e06566df287cd10b9aa8814082ceac48888532e8d13504e71e0994` |
| API          | `sha256:84bc798589dced1af6c22cc570ea25a3e3cc43fc3ddd643f9c9df3d123dc06c8` |
| Web          | `sha256:e1be50e62033296424976a0ee9f1e1063fef3c93b171724417df33c5d3d81d3e` |

El respaldo del origen real aprobó el **2026-11-07T02:15:54.628405Z**: copia externa AES-256-GCM con clave protegida por DPAPI, recuperación desde esa copia y el mismo cifrado verificado en almacenamiento propio del VPS. No se publican archivos privados, identificadores de base ni huellas del respaldo.

El ensayo real aislado del candidato aprobó **13→16 el 02:22:07.305671Z**: 36 tablas y sus filas históricas conservadas, acuerdos originales intactos, integridad de esquema 13 restaurado y esquema 16, consultas efectivas del rol app y privilegios del recolector verificados. No tocó la base real; retiró sus recursos y preservó contenedores preexistentes. El recolector del ensayo permaneció NOLOGIN y no se inventaron tasas.

El ensayo previo conserva **`acl16RoundtripRestored: false`**: su alcance era actualización de copia 13→16. El respaldo posterior independiente del03:40:44.976258Z sí verificó el roundtrip 16 con ACL finales y lecturas app. El respaldo de ventana también fue nuevo y posterior al STOP; ningún PASS previo se reutilizó como evidencia de esos pasos.

El respaldo previo se refrescó el **2026-11-07T03:05:52.645964Z**, con copia cifrada PC/VPS, recuperación desde la externa y limpieza PASS. El respaldo nuevo posterior al STOP aprobó a las 03:31:26.277834Z; el previo no se reutilizó como recuperación de la ventana.

Staging también aprobó un **smoke comercial DEMO 21/21 a las 03:17:34.753Z**: recepción de dos cajas con proveedor/costo NULL, venta de una a USD40 manual/crédito, abono USDT40 1:1, existencia una caja y deuda cero. Replays exactos de las tres operaciones, catálogo sin tarifas, dos GET del PDF y comparación de sus lecturas API sin cambios; tasas antes/después y logout PASS. Es un escenario pequeño, sin transacciones de producción ni sustitución de la suite completa.

El intento anterior de las 02:52:10.645Z se detuvo por una expectativa incorrecta del helper sobre la respuesta POST de configuración. Solo había confirmado tres maestros QA. Se corrigió a GET catálogo, pasaron 13 pruebas offline y se reanudó el mismo journal sin duplicar maestros ni cambiar la aplicación. La evidencia de ambos intentos se conserva.

**Promoción autorizada completada.** Publicación, preservación y respaldo posterior están verificados. Quedan pendientes las pruebas físicas, PDF positivo con venta real y el cierre de la revisión P1 stock/UX V4.8; no se afirma que esa continuación esté lista.

## SQL aplicado

V4.7 no añade una migración. Producción conservó sus trece SQL previos y recibió únicamente estos tres archivos, en orden. Los dieciséis SQL y el journal se contrastan con la fuente inmutable antes de ejecutar.

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

Después de la promoción se generó un respaldo real de dieciséis migraciones: cifrado fuera/dentro del VPS, recuperación aislada, ACL del recolector, lecturas app e integridad PASS a las 03:40:44.976258Z. El ensayo previo permanece separado; esta primera copia es anterior a la observación histórica BCV añadida a las 04:41:32Z. El último respaldo, del 05:21:06.597199Z, ya la incluye y aprobó copia externa, recuperación, limpieza aislada y copia cifrada en el VPS.

## Recuperación si falla

Antes de iniciar migraciones se conserva el estado comprobado y se revisa el fallo; no se improvisa una nueva aprobación ni se sobrescriben controles ajenos. Si falla después de detener escritores, estos permanecen retenidos para inspección. Se preservan PostgreSQL, respaldos y evidencia; no se borran volúmenes ni se repite automáticamente una ventana push previa.

Después de aplicar esquema 16 **no se arranca el código antiguo sobre ese esquema**. La recuperación prioriza un arreglo compatible y verificado. Restaurar un respaldo exige un procedimiento aparte, alcance y aprobación concretos; nunca se restaura uno antiguo encima de ventas o abonos reales posteriores ni se considera un cambio de enlace de release como rollback de base. No hay rollback destructivo automático.

## Cierre pendiente

La publicación real queda acreditada con SHA 82, fecha, preservación de historia/dispositivo/avisos, smoke y respaldo posterior. El propietario aún debe completar una operación con mercancía real y la [guía HP](guia-impresion-hp-v4-7.md), después de resolver la revisión P1 de V4.8. **Tablet y HP físicas siguen pendientes**; capturas y renders no certifican impresión ni uso humano.

## Publicación real y pendientes de beta

Producción quedó **activa y saludable el 2026-11-07T03:33:53.831611Z**, en `phase4-82cd5ab579fb`, runtime `82cd5ab579fbbc50cf852774aca47847cc388fa5`, tras autorización expresa del SHA, migraciones, recolector y ventana del dispatcher. La actualización **13→16 PASS** conservó las filas históricas, la cuenta, **una tablet activa** y los avisos; los controles del dispatcher pasaron antes/después de detener escritores y tras migrar. El respaldo nuevo de la ventana aprobó a las **03:31:26.277834Z**. No se sustituyeron servicios ajenos ni se modificaron DNS/Caddy.

El recolector propio quedó programado y verificado a las **03:35:32.038990Z**, con rol de escritura limitado y cron propio. El respaldo posterior de esquema 16 aprobó copia cifrada externa y en el VPS, recuperación aislada, ACL del recolector y lecturas efectivas del rol app a las **03:40:44.976258Z**. Ese primer respaldo es anterior a la observación histórica BCV. El respaldo más reciente aprobó el **2026-11-07T05:21:06.597199Z**, después de incorporarla: incluye esa observación y verificó copia externa cifrada, recuperación desde ella, limpieza aislada y copia cifrada en el VPS.

La primera observación BCV era **897,53830000**, con fecha valor **9/11/2026**; por ser futura, la aplicación la mantuvo fuera de los cobros actuales. A petición expresa del propietario de usar la última tasa oficial, se verificaron con TLS y hash las dos hojas del [histórico oficial BCV](https://www.bcv.org.ve/sites/default/files/EstadisticasGeneral/2_1_2d26_smc.xls): fecha valor **6/11**, **896,12250000**, y siguiente fecha valor **9/11**, **897,53830000**. Se añadió **una observación**, sin cambiar pagos ni tasas anteriores, a las **04:41:32.252Z**, para el intervalo **[2026-11-06T04:00:00Z, 2026-11-09T04:00:00Z)**. Conservar la última oficial hasta la siguiente fecha valor conocida es una **política de la aplicación autorizada por el usuario**, no una norma de fin de semana atribuida al BCV. La observación y la verificación tienen hora real; no se retrofecharon. El primer intento se detuvo antes de crear el contenedor/INSERT por una representación textual del límite de memoria en Compose; se corrigió solo ese guard y se reanudó la misma intención.

El smoke público autenticado de solo lectura del **2026-11-07T05:04:10.208664Z** aprobó **21/21 controles** y disponibilidad de los cuatro métodos: USD, USDT 1:1, Bs. BCV y Bs. USDT compra. Esto verifica acceso y fuentes en ese instante, **no cuatro cobros reales** ni vigencia indefinida de las cotizaciones. El SHA 82 y sus servicios no se reemplazaron para añadir la observación BCV.

El probe PDF de producción del **03:42:36.628044Z** verificó **anónimo 401**. Los GET positivos Carta/A4/descarga quedaron **`pending_no_real_sale`**: no había venta real para probarlos y no se creó una ficticia. Se conserva ese resultado anterior, que también registró BCV no disponible antes de la corrección histórica; no se convierte retrospectivamente en PASS completo.

La beta general permanece **APTA SOLO PARA PRUEBAS**: está abierta la revisión **P1 de disponibilidad/stock y UX V4.8**, autorizada por el propietario. Poder teclear una cantidad excesiva no demuestra una sobreventa aceptada por el servidor; esa distinción y los casos combinados/concurrentes deben verificarse. V4.8 todavía no está lista ni publicada. El fallback visual `lastOfficial` está en el árbol de trabajo para V4.8, **no forma parte del runtime 82 publicado** y no convierte una observación vencida en una cotización válida. Siguen pendientes la operación física en tablet Android, los PDF de la aplicación en HP y la revisión visual del video.
