# Promoción V4.8 — actualización publicada, esquema 16→16

**V4.8 publicada en producción y apta para beta controlada.** El runtime `03b2d6970ea0f3d1a0a6dc60d0bfbdff68e442df` quedó saludable el **7 de noviembre de 2026 a las 11:58:41.058363 UTC**, después de preservar todas las filas y las dieciséis migraciones existentes. No se ejecutaron migraciones, semillas ni correcciones de datos. Acceso público, consulta del carrito y PDF privados reales aprobaron. El respaldo posterior también aprobó: copia cifrada externa y en el VPS, restauración desde la copia externa y limpieza del ensayo aislado, a las **12:06:41.828811 UTC**.

El propietario autorizó la actualización con «ok actualiza y deja todo listo para que mis socios trabajen»; el operador aceptó el archivo de aprobación específico del SHA, la ventana propia del dispatcher y la actualización del recolector. **No queda una nueva autorización de publicación pendiente.** No se publican la referencia privada de aprobación ni identificadores de la base.

| Identidad           | Valor / resultado                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Producción anterior | `82cd5ab579fbbc50cf852774aca47847cc388fa5` · `phase4-82cd5ab579fb`                                               |
| Runtime publicado   | `03b2d6970ea0f3d1a0a6dc60d0bfbdff68e442df`                                                                       |
| Producción actual   | `phase4-03b2d6970ea0` · saludable                                                                                |
| Staging actual      | `hotfix-03b2d6970ea0` · saludable desde 11:43:57.035928 UTC                                                      |
| Esquema             | 16→16; SQL y journal idénticos; `migrationExecuted=false`                                                        |
| Preservación        | `schemaUnchanged=true`, `allPublicRowsPreserved=true`; PostgreSQL y datos conservados                            |
| Cron propio         | Reanudado, `rateCronHeldForReview=false`; procedencia y comprobación posterior aprobadas                         |
| Runtime Node        | `24.22.1-bookworm-slim`, digest fijado `sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d` |
| Imagen herramientas | `sha256:56dad9a8b2b7f6f1eae3a98e9d449ff307469ec539d844da6ae245b502b048a3`                                        |
| Imagen API          | `sha256:58179b4104e7ee50b3160950225a193a33557c583ef99bd449d271ddaaba57cc`                                        |
| Imagen web          | `sha256:805f7b50abcbe9d0f059968e3bcc30062b1c56bd0289d42b882a1480521b8c03`                                        |

El commit de documentación posterior no sustituye el SHA del runtime desplegado. La promoción anterior queda como historia en [promoción V4.7](promocion-v4-7.md); el alcance actual corresponde al [brief V4.8](referencias/brief-disponibilidad-v4-8.txt).

## Cambio publicado

La disponibilidad del carrito y la confirmación comparten un planificador físico: suma todas las líneas, respeta FIFO y contempla cajas, blísteres y medias compatibles sin contar dos veces el contenido. El preflight autenticado es de solo lectura y no reserva existencias. La confirmación vuelve a planificar bajo el bloqueo y la transacción existentes. La interfaz muestra máximos del carrito, refresca existencias y conserva el borrador cuando debe corregirse.

La recuperación de un comando ya confirmado reutiliza su cuerpo y clave; no depende de que todavía exista el stock consumido. Para ventas nuevas, los UUID aleatorios de las líneas se asignan en orden hexadecimal a las posiciones originales del pedido. Así el lector histórico conserva ese orden sin cambiar filas anteriores, precios, asignaciones ni el orden físico de consumo. No se ordenan los resultados de las pruebas para ocultar una diferencia.

La versión publicada también contiene la continuidad BCV verificada y la referencia histórica solo visual cuando no hay tasa vigente. Actualizar el recolector permite ejecutar esa lógica desde la misma fuente del candidato. Una referencia histórica visible no habilita cobros; USD y USDT recibidos conservan equivalencia 1:1. El cobro VES usa la fuente del acuerdo de la venta: BCV o USDT compra. El smoke autenticado comprobó las cuatro opciones habilitadas el 7 de noviembre de 2026 a las 11:59:53 UTC; cada cobro continúa sujeto a la vigencia de su cotización.

## Evidencia ejecutada

La cuarta QA Linux del SHA publicado aprobó del **7 de noviembre de 2026, 10:04:34.193 a 10:31:59.974 UTC**: tipos y builds, **419 unitarias**, **34 dirigidas**, **149 E2E completas** y **13 pruebas de producción aislada**. Las dirigidas forman parte de la regresión completa, no son casos adicionales. La regresión de migraciones verificó las dieciséis existentes y las actualizaciones históricas. Fuente y dependencias se comprobaron antes y después de cada fase. La [verificación V4.8](verificacion-v4-8.json) conserva las tres ejecuciones anteriores y sus correcciones por separado; no se combinan para fabricar una corrida aprobada.

En staging se preservaron las 37 tablas públicas. La recuperación posterior permitió únicamente nuevas observaciones en `bcv_rates` y `usdt_rates`, comprobando que todos sus registros históricos seguían presentes e intactos. Los respaldos anteriores al arranque y del esquema existente se restauraron en aislamiento. A las **11:51:34.031 UTC**, el smoke comercial DEMO aprobó **29/29 comprobaciones**: recepción 5+4, preview y POST de 10 rechazados sin cambios, venta FIFO de 9, cajas/blísteres en ambos órdenes, precios manuales, USDT 1:1, PDF de lectura y replays. Tres ventas sintéticas sumaron USD 920, dos pagos sumaron USDT 920 y dejaron saldo y stock sintéticos en cero. No se crearon fixtures en producción ni se borró la historia DEMO.

La ventana real preservó dispositivos y avisos antes del STOP (**11:54:52.416771 UTC**), después (**11:55:02.074149 UTC**) y después de verificar código/datos (**11:56:07.216982 UTC**). El respaldo nuevo con escritores detenidos aprobó a las **11:55:16.469908 UTC**: copia cifrada externa, copia cifrada propia del VPS, restauración desde la copia externa y limpieza del ensayo. Se conservaron filas y hashes del negocio, acceso, auditoría y comandos idempotentes; no se reinició ni recreó PostgreSQL.

La verificación posterior a reanudar el cron aprobó sus cuatro controles: mismos servicios propios, procedencia exacta del cron/script, HTTP/pares preservados y auditoría completa realizada antes de reanudarlo. No se modificaron DNS, Caddy ni aplicaciones ajenas.

| Comprobación real en producción      | Resultado y alcance                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Acceso HTTPS y lecturas autenticadas | **21/21 PASS**, 11:59:53.187691 UTC; sesión persistente segura, entorno real, logout y rechazo de cookie anterior      |
| Preview del carrito                  | **PASS**, `previewReadOnly=true`; consulta autenticada sin reserva ni operación comercial                              |
| Disponibilidad de pagos observada    | USD, USDT, VES/BCV y VES/USDT habilitados en esa observación; no es promesa de disponibilidad futura                   |
| PDF de venta real existente          | **5/5 PASS**, 12:01:58.181777 UTC: Carta, descarga Carta, descarga A4, rechazo anónimo y query inválida                |
| Respaldo posterior a publicación     | **PASS**, 12:06:41.828811 UTC; copia externa y copia VPS cifradas, restauración externa y limpieza aislada verificadas |

El smoke de PDF no creó una venta ni cambió datos. Verificó las respuestas PDF por HTTPS, pero no analizó su geometría ni imprimió en papel.

La BCV observada fue **896,1225 Bs./USD**, tomada del [XLS oficial del BCV](https://www.bcv.org.ve/sites/default/files/EstadisticasGeneral/2_1_2d26_smc.xls), con intervalo **6 de noviembre 04:00 UTC a 9 de noviembre 04:00 UTC**. USDT compra se observó en **1.010,20 Bs./USDT a las 11:57:43 UTC**, con vigencia de diez minutos; una nueva observación del mismo valor apareció a las 12:00:21 UTC. Es una cotización cambiante, no una tasa fijada por este informe. La API vuelve a comprobar fuente, hash e intervalo al cobrar; una referencia histórica visible no autoriza un pago VES.

## Incidente de staging y recuperación documentada

La primera ventana alcanzó candidato saludable, preservación completa y publicación/observación del recolector. Tras reanudar su cron, una tercera verificación completa falló a las **10:50:15 UTC** al exigir que la red de base de datos tuviera únicamente PostgreSQL/API. La observación de tasas de las 10:50:11.920 UTC confirma una ejecución del cron; no se conservó evidencia suficiente para atribuir el rechazo a un ID efímero concreto. El operador retuvo solo API/web y el cron propios. Producción permaneció en 82 durante ese incidente.

Se conservaron las dos auditorías completas anteriores a reanudar el cron. El control posterior inspecciona directamente los tres IDs ya verificados —PostgreSQL, API y web—, sus imágenes, salud, reinicios, puertos y redes, además del cron/script exacto y HTTP/pares. No exige la ausencia de un recolector legítimo en vuelo ni relaja el comparador general.

Un primer intento explícito de recuperación se detuvo antes de mutar por una diferencia transitoria de pares cuya identidad no quedó registrada; se conserva como intento fallido, sin atribuirle retrospectivamente una causa. Se añadió evidencia privada exclusiva de los snapshots originales y observados **antes** de comparar. El siguiente intento aprobó los guards completos y recuperó el mismo candidato con `--no-recreate`, sin migrar, crear negocio ni ejecutar otra observación manual de tasas. Finalizó a las **11:43:57.035972 UTC**. Comprobó todas las tablas fuera de las dos cachés, su historial append-only y la misma identidad de PostgreSQL. El fallo original y sus baselines quedaron preservados.

## Operadores revisados

Los helpers privados `v48-staging.py`, `v48-production.py` y `v48-operator-common.py` están separados de los operadores anteriores. Sus planes no abren conexiones; los modos remotos requieren `--execute`. La recuperación del incidente se limitó al SHA publicado, no es un reintento genérico. Aprobaron **26 pruebas offline de operadores** y **14 de recuperación/evidencia**, además de la segunda revisión independiente. Esas pruebas del procedimiento se distinguen de la ejecución real descrita arriba.

Los planes siguen siendo consultables sin ejecutar otra ventana:

```powershell
python work/v48-staging.py plan --commit 03b2d6970ea0f3d1a0a6dc60d0bfbdff68e442df
python work/v48-production.py plan --commit 03b2d6970ea0f3d1a0a6dc60d0bfbdff68e442df
```

## Procedimiento aplicado y guardas conservadas

1. **Comprobar aprobación, archivo fuente, imágenes y recuperación previa.** La autorización debe enlazar el candidato y el commit anterior 82 con la instancia real y aceptar `codeUpdate`, `pushDispatcherWindow` y `ratesCollectorUpdate`. No se reutilizan campos de autorización de migraciones antiguas. No se publican la referencia privada de aprobación ni identificadores de la base.
2. **Pausar y drenar el único escritor propio de tasas.** Guardar el contenido exacto del cron y del script anterior con permisos privados; comprobar procedencia, retirar solo ese cron y esperar el lock del recolector. No tomar la huella estable mientras una ejecución anterior pueda seguir escribiendo. No tocar otros jobs.
3. **Comprobar el dispatcher antes del STOP.** Exigir cero avisos `claimed`, `uncertain` y elegibles; capturar las huellas de dispositivos y avisos. Conservar la tablet y suscripciones existentes, sin desactivar, reemplazar, reenviar ni volver a suscribir. Si no se cumple el guard, detener la intervención para revisión.
4. **Detener solo API y web de Manzanas producción.** Se concede una gracia de 30 segundos al STOP; esto no es una promesa de duración total de la ventana. Verificar que ambos escritores pararon, que PostgreSQL conserva identidad, estado, redes y puertos, y que dispositivos/avisos mantienen sus huellas después del STOP.
5. **Crear otro respaldo con los escritores detenidos.** Debe ser nuevo y posterior al STOP, cifrado en equipo externo y VPS, recuperado desde la copia externa en aislamiento y con limpieza comprobada. El respaldo previo no sustituye esta evidencia.
6. **Demostrar conservación antes de arrancar.** Comparar conteos y huellas de todas las filas de todas las tablas públicas, incluyendo costos conocidos o NULL, maestros, documentos, movimientos, auditoría, comandos idempotentes, acceso, dispositivos, avisos y tasas. En esta promoción no se excluyen columnas añadidas: no hay cambios de esquema. Comprobar nuevamente los dieciséis hashes/journal, binding, integridad y privilegios; dispositivos y avisos deben seguir iguales. No ejecutar `migrate`, seeds ni reparaciones automáticas.
7. **Vincular el control de activación y arrancar las imágenes aprobadas.** Solo después de las pruebas anteriores se actualizan la referencia de release y el gate existente al SHA autorizado. Arrancar únicamente API/web con las imágenes ya verificadas y comprobar health, entorno, release, `ready` y preservación de servicios preexistentes. No reiniciar ni recrear PostgreSQL.
8. **Publicar el recolector y reanudar su cron propio.** Cambiar el script desde el contenido anterior exacto al del candidato; conservar rol, secreto y redes. Ejecutar una observación real de BCV y USDT, verificar su fecha y resultado, y demostrar que las tasas previas no se modificaron ni borraron. Las observaciones nuevas son append-only. Restaurar el cron exacto solo después de aprobar esta comprobación. Un estado de recolector `verified/unchanged` no demuestra por sí solo una tasa vigente: la API pública autenticada decide disponibilidad.
9. **Validar acceso y operación de lectura.** Ejecutar `v48-public-smoke.py` contra HTTPS estricto y host fijo, con manifiesto/estado/gate e imágenes de API/web ligados al SHA. Verificar sesión persistente segura, lecturas REAL, fuentes/tasas y logout. Si hay configuración confirmada, consultar una unidad mediante `sale-preview` sin reservar ni crear negocio. Stock cero es una respuesta válida del preflight; si no hay configuración confirmada, registrar `pending_no_confirmed_configuration`, sin afirmar prueba positiva.
10. **Comprobar PDF existente y respaldo posterior.** `v48-public-pdf-smoke.py` verifica denegación anónima y, solo si existe una venta real, el PDF Carta/A4 y descarga privada. Si no existe, registrar `pending_no_real_sale` y mantener nulas las comprobaciones positivas: no crear una venta ficticia en producción. Completar un nuevo respaldo cifrado PC/VPS, restaurado externamente con ACL/lecturas efectivas del candidato, limpieza y verificación final de integridad, PostgreSQL, dispositivos/avisos y servicios ajenos.

Los smokes reales no envían WhatsApp, no suscriben dispositivos ni fuerzan avisos push. El operador no modifica DNS, Caddy, redes compartidas o aplicaciones ajenas. La comparación conserva los baselines originales; la excepción ya revisada del único worker ajeno en reinicio continuo exige identidad, configuración y redes exactas, sin relajar la comprobación de servicios estables.

## Fallo, recuperación y límites

Un fallo conserva la etapa y su evidencia. Si los escritores propios ya se habían detenido, el operador los mantiene parados para revisión; si el cron propio ya se había reanudado, intenta retener únicamente ese cron exacto y espera el lock. Cualquier resultado incierto se registra para revisión manual. No se repite automáticamente una ventana fallida ni se descarta su journal.

**No hay rollback automático.** Una reversión manual de código requiere comprobar compatibilidad del código anterior con los documentos y observaciones de tasas que ya existan, preservar imágenes/configuración previas y no cambiar datos. Que el esquema siga en 16 no demuestra por sí solo que sea seguro volver a 82. Si la compatibilidad no está probada, mantener la operación detenida y preparar una corrección hacia adelante.

Nunca restaurar un dump anterior sobre una base que haya recibido operaciones posteriores para simular una reversión de código. Una recuperación de base sería una acción distinta, con diagnóstico, conciliación y autorización explícitos. Los comandos comerciales con respuesta ambigua conservan cuerpo y clave para replay; no se borran recibos idempotentes ni se generan nuevos comandos para reemplazarlos.

Las pruebas físicas de Android/tablet e impresión HP mantienen su estado pendiente hasta observación humana. El escenario final solicitado —5+4=9, rechazo inmediato de 25/10, venta de 6 que deja 3 y nota de entrega con todas las líneas— debe verificarse sin presentarlo como ya realizado en un dispositivo físico.

## Resultado y límites de uso

**APTA PARA BETA CONTROLADA, publicada y disponible para los socios.** Esta promoción ya fue autorizada y ejecutada. Anti-sobreventa, concurrencia, precios manuales y replay tienen evidencia automatizada; staging añade el recorrido comercial DEMO, y producción acredita acceso, preview sin reservas, cotizaciones y PDF de una venta real existente.

El respaldo posterior quedó verificado. Las comprobaciones físicas de tablet/Android e impresión HP requieren observación humana y no se presentan como aprobadas. Las cuatro opciones de pago estuvieron disponibles en los smokes indicados; cada operación depende de la vigencia actual de su fuente. No se garantiza una cotización futura ni se convierte la evidencia de navegador/PDF en una certificación de impresión física.

Los cuatro contenedores temporales de QA permanecen detenidos. Su eliminación no se ejecutó: la revisión automática exigió autorización expresa para borrarlos. Esta limpieza pendiente es distinta de la limpieza del ensayo aislado de restauración del respaldo, que sí aprobó. No impide el funcionamiento de la versión publicada.
