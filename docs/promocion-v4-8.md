# Promoción V4.8 — actualización de código, esquema 16→16

**Plan preparado; publicación pendiente.** El candidato es `6be915e91df84743100e2d332b5e007f393eb521`. La tercera ejecución aprobó 419 unitarias y 34 dirigidas; terminó 148/149 E2E por una expectativa de orden interno del test. Se prepara una cuarta ejecución tras fortalecer esa prueba; el runtime no cambia. Este documento no declara PASS final, despliegue en staging ni activación en producción de ese candidato.

| Identidad                                  | Valor / estado                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Producción de origen                       | `82cd5ab579fbbc50cf852774aca47847cc388fa5` · `phase4-82cd5ab579fb`                                                              |
| Staging de origen esperado                 | Mismo SHA 82 · `hotfix-82cd5ab579fb`; comprobar nuevamente antes de intervenir                                                  |
| Candidato V4.8                             | `6be915e91df84743100e2d332b5e007f393eb521`                                                                                      |
| Releases previstas                         | Producción `phase4-6be915e91df8`; staging `hotfix-6be915e91df8`                                                                 |
| Esquema                                    | Dieciséis migraciones existentes; **cero migraciones nuevas y ninguna ejecución del migrador**                                  |
| Fuente SQL                                 | Comparación Git entre 82 y el candidato sin diferencias en `packages/database/migrations`, incluido el journal                  |
| Runtime Node                               | `24.22.1-bookworm-slim`, digest fijado `sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d`                |
| Imágenes, archivo fuente y pruebas finales | Sus identidades y resultados se incorporarán cuando estén verificados; no se atribuyen aquí resultados de candidatos anteriores |
| Autorización operativa                     | **PENDIENTE**, específica para este SHA, actualización del recolector y ventana del dispatcher push                             |

La publicación previa de V4.7 y su autorización se conservan como historia en [promoción V4.7](promocion-v4-7.md). No autorizan esta nueva intervención. El alcance vigente corresponde al [brief V4.8](referencias/brief-disponibilidad-v4-8.txt).

## Cambio que se propone publicar

La disponibilidad del carrito y la confirmación comparten un planificador físico: suma todas las líneas, respeta FIFO y contempla cajas, blísteres y medias compatibles sin contar dos veces el contenido. El preflight autenticado es de solo lectura y no reserva existencias. La confirmación vuelve a planificar bajo el bloqueo y la transacción existentes. La interfaz muestra máximos del carrito, refresca existencias y conserva el borrador cuando debe corregirse.

La recuperación de un comando ya confirmado reutiliza su cuerpo y clave; no depende de que todavía exista el stock consumido. Para ventas nuevas, los UUID aleatorios de las líneas se asignan en orden hexadecimal a las posiciones originales del pedido. Así el lector histórico conserva ese orden sin cambiar filas anteriores, precios, asignaciones ni el orden físico de consumo. No se ordenan los resultados de las pruebas para ocultar una diferencia.

El candidato también contiene la continuidad BCV verificada y la referencia histórica solo visual cuando no hay tasa vigente. Actualizar el recolector permite ejecutar esa lógica desde la misma fuente del candidato. Una referencia histórica visible no habilita cobros; USD y USDT recibidos conservan equivalencia 1:1. El cobro VES usa la fuente del acuerdo de la venta: BCV o USDT compra. Las tasas efectivamente disponibles se comprobarán al terminar, sin prometer de antemano que las cuatro opciones estarán habilitadas.

## Evidencia necesaria antes de la ventana real

1. Cerrar QA del SHA exacto: tipos, unitarias, builds, dirigidos V4.8 y regresiones relacionadas, E2E fresh, producción aislada y verificaciones de migración/restauración aplicables. Registrar cantidades, tiempos y fallos reales; la ejecución actual sigue pendiente. Mantener la matriz T01–T20 vinculada a evidencia ejecutada.
2. Preparar el archivo inmutable y manifiesto del candidato; verificar que los dieciséis SQL, sus hashes y el journal son idénticos al origen. Construir y comprobar las imágenes de herramientas, API y web sin activar servicios. Registrar sus IDs reales, sin reutilizar los de 82.
3. Completar staging 16→16 mediante el operador revisado y su conservación de filas. Aprobar acceso, preview autenticado, PDF y el recorrido comercial DEMO antes de solicitar publicación real. Los fixtures sintéticos solo se permiten en QA/staging.
4. Crear un respaldo real reciente, cifrado AES-256-GCM tanto en el equipo externo como en almacenamiento propio del VPS, con protección DPAPI de la clave local. Recuperar desde la copia externa en aislamiento y verificar integridad, privilegios efectivos y lecturas del rol app. El guard exige evidencia reciente de menos de una hora; conservar los resultados de limpieza.
5. Releer la release real, el binding inmutable, imágenes, identidad y estado de PostgreSQL, dispositivos, avisos, redes y servicios preexistentes. Si el origen difiere del esperado, detener la promoción para revisión; no cambiar el baseline para hacer pasar una comparación.
6. Presentar al propietario una única solicitud concreta sobre el candidato, **sin migraciones**, la pausa propia de API/web y dispatcher push, y la actualización del recolector. La preparación y los planes por sí solos no conceden esa autorización.

Las pruebas offline de los operadores son controles adicionales, no prueba de despliegue: 18 de operadores, 12 del smoke comercial de staging y 20 de los smokes públicos/PDF aprobaron con mocks. Los dos verificadores públicos también recibieron segunda revisión independiente. No se conectaron a producción al ejecutar esas pruebas.

## Operadores revisados y comprobaciones de staging

Los helpers privados `v48-staging.py`, `v48-production.py` y `v48-operator-common.py` están separados de los operadores de V4.7. Sus planes no abren conexiones. `prepare` prepara archivos locales; los modos remotos requieren `--execute`. Producción exige además el archivo privado de aprobación exacta. Los comandos siguientes únicamente muestran el plan:

```powershell
python work/v48-staging.py plan --commit 6be915e91df84743100e2d332b5e007f393eb521
python work/v48-production.py plan --commit 6be915e91df84743100e2d332b5e007f393eb521
```

Staging verifica el origen 82, imágenes exactas y las dieciséis migraciones; pausa únicamente su cron de tasas, conserva su contenido y espera a que termine una ejecución en vuelo mediante `flock`. Después detiene solo su API/web, mantiene PostgreSQL, crea un respaldo restaurado, compara todas las filas y ejecuta los verificadores de integridad/binding. Un segundo respaldo restaurado precede al arranque del candidato. No ejecuta migraciones ni semillas.

El operador sustituye solo el script propio del recolector, vinculado al nuevo SHA. Comprueba observaciones recientes de ambas fuentes y que las filas anteriores de tasas siguen intactas antes de restaurar el cron propio exacto. No crea roles, secretos ni redes para esta actualización. Las pruebas de staging deberán confirmar además que producción y los servicios ajenos siguen preservados.

`v48-staging-business-smoke.py` ofrece un recorrido DEMO reanudable con intenciones, cuerpos y claves guardados antes de cada POST: recepción 5+4, rechazo de 10, venta FIFO de 9, combinaciones de cajas/blísteres en ambos órdenes, cobros USDT 1:1, PDF y replays. No borra su historia al terminar. Este es un smoke dirigido y no sustituye la matriz completa. Su resultado real para el candidato sigue pendiente.

## Ventana de producción, en orden

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

## Solicitud final pendiente

Texto propuesto para presentar **después** de cerrar QA, staging y recuperación previa, todavía no enviado ni aprobado por este documento:

> Autorizar la actualización de Manzanas Maracay desde `82cd5ab579fbbc50cf852774aca47847cc388fa5` a `6be915e91df84743100e2d332b5e007f393eb521`, sin ejecutar migraciones y conservando las dieciséis actuales y todos los datos; aceptar la ventana propia de API/web y dispatcher push con preservación de tablet/avisos, el respaldo nuevo restaurado con escritores detenidos y la actualización del recolector BCV/USDT y su cron propio. Mantener PostgreSQL, DNS, Caddy y otros servicios sin cambios.

La preparación queda documentada. El cierre de esta promoción requiere resultados finales y autorización operativa expresa; aún no corresponde declarar V4.8 publicada o lista para beta real.
