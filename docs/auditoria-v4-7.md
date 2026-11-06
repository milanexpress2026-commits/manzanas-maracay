# Auditoría de beta V4.7

Estado al 6 de noviembre de 2026: **APTA SOLO PARA PRUEBAS**. Hay correcciones implementadas y pruebas dirigidas aprobadas; la ejecución integrada de V4.7 en Linux, su staging y la publicación autorizada todavía están pendientes. Esta conclusión describe el candidato V4.7, no sustituye la operación anterior actualmente publicada.

El alcance procede del [brief V4.7](referencias/brief-cierre-beta-v4-7.txt). Se continúa desde `566ff95fb37625766f73d075cdb0b4fdc3e55173` en `feature/cierre-beta-v4-7`. El SHA final de esta ampliación todavía no está fijado en esta evidencia: las pruebas dirigidas corresponden al árbol de trabajo modificado. No se afirma que un commit anterior valide estos cambios.

## Evidencia y separación de entornos

- Baseline V4.5: runtime `817a2783da7c4405e9c9609335adfe239a88e3ef`, pruebas ajustadas en `998cceb478b525ceecda5e24ff53e86ce2c7105e`, aplicación y migraciones idénticas entre ambos. Pasaron 286 unitarias, tipos/builds, 115 casos E2E distintos entre varias ejecuciones y 13/13 de producción aislada. **No hubo una única ejecución de 115 aprobados.** Véanse [matriz V4.5](matriz-aceptacion-v4-5.md) y [verificación V4.5](verificacion-v4-5.json).
- Estado remoto previamente comprobado: staging V4.5 `817a278`, 16 migraciones y 16 comprobaciones de acceso aprobadas; producción `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`, 13 migraciones. La auditoría V4.7 no actualizó ninguno de esos entornos.
- Recuperación durable V4.7: **35/35 unitarias PASS** en `commercial-journal.test.ts` y `command-rejection.test.ts`; typecheck general y web PASS. Son pruebas sin PostgreSQL ni servidores. El Node local observado es `v24.19.0`; esto no acredita todavía la ejecución del candidato con el Node parcheado.
- Documentos V4.7: **15/15 unitarias de PDF PASS** y **15/15 unitarias de entrega web PASS**. Hay 12 PDF sintéticos y 37 páginas renderizadas con extracción y comprobaciones geométricas. La [revisión visual](capturas/impresion-v4-7/revision-visual.json) acredita inspección en pantalla de las 11 páginas públicas de 1/25/50 líneas y ejemplos adicionales; no acredita impresora ni tablet físicas.
- `npm audit --omit=dev --json`, ejecutado y leído durante esta revisión: **0 avisos reportados**, incluidos 0 altos y 0 críticos. No se confunde con la consulta offline anterior ni con una evaluación del ejecutable Node, de las librerías del sistema o de vulnerabilidades todavía no publicadas.
- Están preparados 15 casos E2E V4.7: 4 de API/SQL, 3 de recuperación comercial y 8 de documentos/interfaz. Su existencia y listado no son un PASS; la ejecución Linux sigue pendiente, junto con la regresión completa, producción aislada y migraciones del candidato final.

## Hallazgos P0/P1/P2 y cierre requerido

No se demostró un P0 en la revisión estática. Los siguientes hallazgos tienen corrección o comprobación concreta; los estados pendientes impiden presentarlos como cerrados en producción.

### P1 SEC-01 — Node anterior al parche de seguridad

La imagen tools del baseline V4.5 informó Node `v24.21.0`. El aviso oficial incluye CVE-2026-111497, una corrupción de memoria al descomprimir Brotli malformado; Node 24.22.1 contiene la corrección. No se ha demostrado un camino público explotable en esta aplicación: la API está detrás de sesión/proxy y el proxy no reenvía `Content-Encoding`. La versión de la producción antigua no se deduce de la imagen de QA. Fuentes primarias: [aviso Node de octubre](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1).

**Corrección implementada:** [Dockerfile de staging](../infra/Dockerfile) y [Dockerfile de producción](../infra/Dockerfile.production) fijan `node:24.22.1-bookworm-slim@sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d`, con guard de versión parcheada. **Pendiente:** construir/verificar imágenes finales, ejecutar QA con ese runtime y acreditar la actualización efectiva de los servicios propios cuando se autorice publicar. Un `npm audit` con cero avisos no cierra este hallazgo.

### P1 SEC-02 — Venta o abono duplicable al perder respuesta y recargar

**Reproducción del defecto anterior:** el servidor puede completar COMMIT y perderse la respuesta. La clave del cliente estaba solo en `useRef`; recargar o cerrar la pantalla perdía clave y cuerpo. Reconstruir el formulario generaba otra clave, que podía registrar otra operación si quedaban existencias o deuda. La idempotencia de la base era correcta para una misma clave; el problema estaba en conservarla en el navegador.

**Corrección implementada:** [journal comercial](../apps/web/src/lib/commercial-journal.ts) y [hook](../apps/web/src/lib/inventory-api.ts) guardan y verifican el cuerpo original, su hash, versión y clave antes del POST. La partición incluye usuario y entorno; Web Locks excluye envíos simultáneos desde pestañas. La recuperación es manual, reutiliza los mismos bytes/clave y permite recuperar un comprobante aunque después hayan cambiado stock, saldo o cotización. Una sesión vencida conserva el pendiente. No se guardan contraseñas, cookies ni tokens.

Un resultado ambiguo, corrupción del registro o falta de almacenamiento no genera otra clave ni sobrescribe el pendiente. Solo un rechazo empresarial de **primer intento**, con la misma clave y rollback confirmado por la API, permite editar. El [marcador de rechazo](../apps/api/src/command-rejection.ts) excluye autenticación, conflicto de clave anterior, bloqueo SQL, fallo del rollback y cualquier COMMIT intentado. Se aceptan errores empresariales HTTP y restricciones SQL `23503`, `23514`, `23505` únicamente después de callback iniciado y rollback confirmado. No se persisten rechazos ni se modifica el esquema.

**Verificación:** 35/35 unidades PASS, incluidas respuesta perdida, conflicto de pestañas, partición, corrupción, almacenamiento bloqueado, rechazo inequívoco, restricciones SQL y ausencia del marcador ante incertidumbre. **Pendiente:** [3 casos de navegador/SQL](../tests/e2e/commercial-recovery-v47.spec.ts) con COMMIT real antes del corte, recarga/cierre/logout/login, misma venta/abono y una sola afectación de existencias/deuda.

**Límite residual deliberado:** después de un intento ambiguo, un rechazo posterior no autoriza borrar automáticamente el pendiente. No existe una consulta negativa de recibo de comando que pruebe por sí sola que nunca hubo COMMIT. Se conserva el replay manual y la revisión operativa; no hay botón de reinicio que pueda cobrar o vender de nuevo por accidente. El journal depende del almacenamiento de ese dispositivo: borrar sus datos o cambiar de dispositivo no equivale a recuperar una clave conservada.

### P2 VAL-01 — Restore sin lectura efectiva bajo el rol de aplicación

La validación anterior comprobaba integridad y privilegios con el rol de respaldo. Eso no demostraba por sí solo que la aplicación pudiera consultar las filas restauradas bajo sus políticas de acceso; tampoco era evidencia de un restore roto.

**Corrección implementada:** [verificador de restauración](../scripts/production-verify-restore.sql) captura cantidades con visibilidad administrativa, ejecuta consultas bajo `SET LOCAL ROLE mm_prod_app`, compara las cantidades y recorre joins de inventario/deuda y acceso. No cambia datos comerciales, ACL ni credenciales. **Pendiente:** ejecutar el verificador actualizado sobre una restauración aislada del candidato y conservar su resultado. Las restauraciones anteriores siguen siendo evidencia del baseline, no de esta comprobación nueva.

## Controles inspeccionados sin un nuevo P0/P1 demostrado

| Área                  | Control/evidencia de código                                                                                                        | Alcance de la conclusión                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sesión y fuerza bruta | Guard global Nest, hash de tokens, cookies HttpOnly/Secure/SameSite, revocación y limitación persistente de login                  | Revisión estática más baseline QA; repetir integrado V4.7                                                        |
| CSRF y rutas          | Origin exacto en mutaciones, token interno servidor, lista de rutas/métodos y tamaño de cuerpo en proxy                            | No se identificó una ruta comercial anónima nueva                                                                |
| Documentos privados   | Guard de sesión, UUID/ruta validados, bytes PDF, disposición segura, `no-store`/`nosniff`, sin fallback HTML del service worker    | 15 unidades web PASS; pruebas HTTP/SQL V4.7 pendientes                                                           |
| SQL/XSS               | Parámetros SQL para valores; tablas seleccionadas por código; React escapa texto; PDF trata contenido como texto literal           | No se encontró un sumidero de ejecución por entrada del usuario en el alcance revisado                           |
| Idempotencia y stock  | Clave bloqueada antes de consultar recibo, transacción única, bloqueo de inventario, asientos/compensaciones y costo NULL trazable | Baseline probado; recuperación de navegador ampliada en SEC-02                                                   |
| Tasas y permisos      | Cachés de lectura para API; recolector propio con escritura limitada; conversión y snapshot según acuerdo                          | Cotización real vigente debe verificarse de nuevo al publicar; ningún fixture QA representa una tasa del negocio |
| Logs y secretos       | No se añaden cuerpos ni credenciales a errores; marcador devuelve solo resultado y clave; secretos fuera del repositorio           | No es una afirmación de ausencia universal de secretos ni un ataque sobre el VPS                                 |
| Aislamiento y backup  | Recursos propios, gates de producción y limpieza de recursos identificados; nueva lectura con rol de aplicación                    | No se ejecutaron restauraciones ni cambios remotos como parte de esta auditoría estática                         |

Se aplicaron las instrucciones de `security-best-practices` y sus referencias de React, Next.js, JavaScript y Express pertinentes a Nest, además de las reglas de integridad del proyecto. No se hicieron ataques intrusivos sobre el sitio público ni sobre aplicaciones ajenas.

## Documentos, operación física y publicación

La nota ahora usa Carta por defecto, A4 opcional, filas completas y cabeceras repetidas. Las firmas y los totales forman un bloque; precios/productos/condición mantienen su snapshot, y el saldo actual se etiqueta al imprimir. Las notas anuladas llevan aviso de no entregar. El recibo conserva el saldo posterior a ese abono, identificado como histórico. Los símbolos que Helvetica no representa se muestran mediante códigos Unicode explícitos, sin reemplazo silencioso.

Muestras públicas sintéticas: [1 línea](capturas/impresion-v4-7/entrega-01.pdf), [25 líneas](capturas/impresion-v4-7/entrega-25.pdf), [50 líneas](capturas/impresion-v4-7/entrega-50.pdf). La [verificación automática](capturas/impresion-v4-7/verificacion-automatica.json) y la revisión visual son evidencias separadas de la impresión física. El recibo de abono tiene verificación unitaria propia; los campos de conteo/suma específicos de renglones de mercancía no deben interpretarse como comprobaciones aplicables a ese recibo.

El propietario confirmó que la HP Smart Tank 215 imprime documentos ordinarios. **PENDIENTE HP REAL:** PDF protegido de esta aplicación, una hoja y varias páginas, márgenes y legibilidad. **PENDIENTE TABLET REAL:** Chrome Android, visor/descarga, sesión, teclado y retorno a la venta. Abrir un visor no acredita papel impreso.

La [matriz de aceptación](matriz-aceptacion-v4-7.md) separa estos estados. Antes de promover V4.7 deben concluir QA integrado sobre SHA final, staging, backup/restauración e inspección real de producción; después debe solicitarse la autorización operativa concreta del SHA, migraciones `0013/0014/0015`, recolector y ventana. No se crea una aprobación a partir de una petición general de tener todo listo. No hay merge ni publicación V4.7 acreditados en este informe.
